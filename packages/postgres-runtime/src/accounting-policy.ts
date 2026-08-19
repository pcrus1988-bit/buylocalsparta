import { createHash } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "./admin-auth.ts";

export type FiscalisationRoute = "unselected" | "viva_fiscal_provider" | "aade_direct_erp";
export type PolicyDecisionStatus = "pending" | "approved" | "rejected" | "not_applicable";
export type MappingProductionStatus = "proposed" | "approved" | "future" | "exception";

export type AccountingPolicyWorkspace = Readonly<{
  policy?: Readonly<{
    id:string; version:string; status:string; sellerOfRecord:boolean; sellerLegalName:string; sellerTaxNumber:string;
    compatibilityTarget:string; productionPublishedSchema?:string; fiscalisationRoute:FiscalisationRoute; effectiveFrom?:string;
    accountantName?:string; approvedAt?:number; approvalNotes?:string; policyHash?:string;
  }>;
  checks: readonly Readonly<{ code:string; label:string; required:boolean; status:PolicyDecisionStatus; evidence?:string; decidedAt?:number }>[];
  documentMappings: readonly Readonly<{ eventCode:string; customerKind:string; itemKind:string; geography:string; direction:string; invoiceType:string; incomeCategory?:string; e3Code?:string; seriesCode:string; status:MappingProductionStatus; correlationRequired:boolean; negativeOriginalClassification:boolean; notes?:string }>[];
  paymentMappings: readonly Readonly<{ processor:string; processorMethod:string; mydataPaymentType:number; requiresTransactionId:boolean; erpRequiresEcrToken:boolean; providerSignatureRoute:boolean; status:MappingProductionStatus; notes?:string }>[];
  series: readonly Readonly<{ series:string; invoiceType:string; purpose:string; fiscalYear:number; nextAa:number; lastIssuedAa?:number; lastMark?:string; locked:boolean }>[];
  vatCategories: readonly Readonly<{ code:number; rateBps:number; label:string; specialCategory:boolean }>[];
  taxProfileCoverage: Readonly<{ activeVariants:number; coveredVariants:number; missingVariants:number; approvedProfiles:number; unapprovedProfiles:number; approvedProfileHashes:readonly string[] }>;
  runtimeConfig: Readonly<{ environment:string; specVersion:string; requestTimeoutMs:number; issuanceEnabled:boolean; ecrTokenEnabled:boolean; vivaFiscalEnabled:boolean; mappingVersionPin?:string; capturePaidOrders:boolean; emailAcceptedDocuments:boolean }>;
  technicalCapabilities: Readonly<{ directErpEcrToken:boolean; vivaFiscalProvider:boolean }>;
  productionReady:boolean;
  blockers:readonly string[];
}>;

const RUNTIME_CONFIG_KEY="mydata.admin_runtime_config";

export class PostgresAccountingPolicyService {
  readonly #uow:PostgresUnitOfWork;
  readonly #env:NodeJS.ProcessEnv;
  constructor(pool:SqlPool, env:NodeJS.ProcessEnv=process.env){this.#uow=new PostgresUnitOfWork(pool);this.#env=env;}

  async workspace(principal:SessionPrincipal, now=Date.now()):Promise<AccountingPolicyWorkspace>{
    return this.#uow.withTransaction(platformScope(principal.userId), async tx => {
      const runtimeSetting=await tx.query<SqlRow>(`SELECT s.value FROM system_settings s JOIN markets m ON m.id=s.market_id WHERE m.code=$1 AND s.key=$2 LIMIT 1`,[this.#marketCode(),RUNTIME_CONFIG_KEY]);
      const runtimeConfig=runtimeConfigFromValue(runtimeSetting.rows[0]?.value,this.#env);
      const technicalCapabilities={directErpEcrToken:runtimeConfig.ecrTokenEnabled,vivaFiscalProvider:runtimeConfig.vivaFiscalEnabled};
      const p=await tx.query<SqlRow>(`SELECT public_id,version,status,seller_of_record,seller_legal_name,seller_tax_number,compatibility_target,
          production_published_schema,fiscalisation_route,effective_from,accountant_name,approved_at,approval_notes,policy_hash
        FROM accounting_tax_policies
        WHERE market_id=(SELECT id FROM markets WHERE code=$1 LIMIT 1)
        ORDER BY CASE status WHEN 'review' THEN 0 WHEN 'draft' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, created_at DESC LIMIT 1`,[this.#marketCode()]);
      if(!p.rowCount)return{checks:[],documentMappings:[],paymentMappings:[],series:[],vatCategories:[],taxProfileCoverage:{activeVariants:0,coveredVariants:0,missingVariants:0,approvedProfiles:0,unapprovedProfiles:0,approvedProfileHashes:[]},runtimeConfig,technicalCapabilities,productionReady:false,blockers:["Accounting policy has not been created"]};
      const row=p.rows[0], policyId=text(row.public_id);
      const [checks,docs,payments,series,vat,coverage,profileHashes]=await Promise.all([
        tx.query<SqlRow>(`SELECT c.check_code,c.label,c.required,c.status,c.evidence,c.decided_at FROM accounting_tax_policy_checks c JOIN accounting_tax_policies p ON p.id=c.policy_id WHERE p.public_id=$1 ORDER BY c.required DESC,c.check_code`,[policyId]),
        tx.query<SqlRow>(`SELECT d.event_code,d.customer_kind,d.item_kind,d.geography,d.direction,d.invoice_type,d.income_category,d.e3_code,d.series_code,d.production_status,d.negative_original_classification,d.correlation_required,d.notes FROM mydata_document_mappings d JOIN accounting_tax_policies p ON p.id=d.policy_id WHERE p.public_id=$1 ORDER BY d.event_code`,[policyId]),
        tx.query<SqlRow>(`SELECT m.processor,m.processor_method,m.mydata_payment_type,m.requires_transaction_id,m.erp_requires_ecr_token,m.provider_signature_route,m.production_status,m.notes FROM mydata_payment_mappings m JOIN accounting_tax_policies p ON p.id=m.policy_id WHERE p.public_id=$1 ORDER BY m.processor,m.processor_method`,[policyId]),
        tx.query<SqlRow>(`SELECT s.series,s.invoice_type,s.purpose,s.fiscal_year,s.next_aa,s.last_issued_aa,s.last_mark,s.locked FROM mydata_fiscal_series s JOIN markets m ON m.id=s.market_id WHERE m.code=$1 ORDER BY s.series`,[this.#marketCode()]),
        tx.query<SqlRow>(`SELECT code,rate_bps,label,special_category FROM mydata_vat_category_catalog ORDER BY code`),
        tx.query<SqlRow>(`WITH active AS (
            SELECT cv.id FROM canonical_variants cv JOIN markets m ON m.id=cv.market_id
            WHERE m.code=$1 AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
          ), covered AS (
            SELECT DISTINCT p.canonical_variant_id AS id FROM product_tax_profiles p JOIN active a ON a.id=p.canonical_variant_id
            WHERE p.accountant_approved=true AND p.effective_from <= $2::date AND (p.effective_until IS NULL OR p.effective_until >= $2::date)
          )
          SELECT (SELECT count(*) FROM active) AS active_variants,(SELECT count(*) FROM covered) AS covered_variants,
            (SELECT count(*) FROM product_tax_profiles p JOIN markets m ON m.id=p.market_id WHERE m.code=$1 AND p.accountant_approved=true) AS approved_profiles,
            (SELECT count(*) FROM product_tax_profiles p JOIN markets m ON m.id=p.market_id WHERE m.code=$1 AND p.accountant_approved=false) AS unapproved_profiles`,[this.#marketCode(),athensDate(now)]),
        tx.query<SqlRow>(`SELECT ptp.profile_hash FROM product_tax_profiles ptp JOIN markets m ON m.id=ptp.market_id WHERE m.code=$1 AND ptp.accountant_approved=true AND ptp.profile_hash IS NOT NULL ORDER BY ptp.profile_hash`,[this.#marketCode()])
      ]);
      const policy={id:policyId,version:text(row.version),status:text(row.status),sellerOfRecord:bool(row.seller_of_record),sellerLegalName:text(row.seller_legal_name),sellerTaxNumber:text(row.seller_tax_number),compatibilityTarget:text(row.compatibility_target),productionPublishedSchema:optional(row.production_published_schema),fiscalisationRoute:text(row.fiscalisation_route) as FiscalisationRoute,effectiveFrom:dateValue(row.effective_from),accountantName:optional(row.accountant_name),approvedAt:epochOptional(row.approved_at),approvalNotes:optional(row.approval_notes),policyHash:optional(row.policy_hash)};
      const checkRows=checks.rows.map(r=>({code:text(r.check_code),label:text(r.label),required:bool(r.required),status:text(r.status) as PolicyDecisionStatus,evidence:optional(r.evidence),decidedAt:epochOptional(r.decided_at)}));
      const docRows=docs.rows.map(r=>({eventCode:text(r.event_code),customerKind:text(r.customer_kind),itemKind:text(r.item_kind),geography:text(r.geography),direction:text(r.direction),invoiceType:text(r.invoice_type),incomeCategory:optional(r.income_category),e3Code:optional(r.e3_code),seriesCode:text(r.series_code),status:text(r.production_status) as MappingProductionStatus,correlationRequired:bool(r.correlation_required),negativeOriginalClassification:bool(r.negative_original_classification),notes:optional(r.notes)}));
      const payRows=payments.rows.map(r=>({processor:text(r.processor),processorMethod:text(r.processor_method),mydataPaymentType:int(r.mydata_payment_type),requiresTransactionId:bool(r.requires_transaction_id),erpRequiresEcrToken:bool(r.erp_requires_ecr_token),providerSignatureRoute:bool(r.provider_signature_route),status:text(r.production_status) as MappingProductionStatus,notes:optional(r.notes)}));
      const seriesRows=series.rows.map(r=>({series:text(r.series),invoiceType:text(r.invoice_type),purpose:text(r.purpose),fiscalYear:int(r.fiscal_year),nextAa:int(r.next_aa),lastIssuedAa:intOptional(r.last_issued_aa),lastMark:optional(r.last_mark),locked:bool(r.locked)}));
      const vatRows=vat.rows.map(r=>({code:int(r.code),rateBps:int(r.rate_bps),label:text(r.label),specialCategory:bool(r.special_category)}));
      const c=coverage.rows[0]??{};const active=int(c.active_variants??0),covered=int(c.covered_variants??0);
      const taxProfileCoverage={activeVariants:active,coveredVariants:covered,missingVariants:Math.max(0,active-covered),approvedProfiles:int(c.approved_profiles??0),unapprovedProfiles:int(c.unapproved_profiles??0),approvedProfileHashes:profileHashes.rows.map(r=>text(r.profile_hash))};
      const blockers=policyBlockers({policy,checks:checkRows,documentMappings:docRows,paymentMappings:payRows,taxProfileCoverage,technicalCapabilities});
      return{policy,checks:checkRows,documentMappings:docRows,paymentMappings:payRows,series:seriesRows,vatCategories:vatRows,taxProfileCoverage,runtimeConfig,technicalCapabilities,productionReady:policy.status==='approved'&&blockers.length===0,blockers};
    },{readOnly:true});
  }

  async setFiscalisationRoute(principal:SessionPrincipal,input:{policyId:string;route:FiscalisationRoute;reason:string}){
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const r=await tx.query<SqlRow>(`UPDATE accounting_tax_policies SET fiscalisation_route=$2,status=CASE WHEN status='draft' THEN 'review' ELSE status END,approval_notes=concat_ws(E'\n',NULLIF(approval_notes,''),$3),updated_at=now()
        WHERE public_id=$1 AND status IN ('draft','review') RETURNING version`,[input.policyId,input.route,`Fiscalisation route: ${input.route}. ${input.reason}`]);
      if(!r.rowCount)throw new Error("Accounting policy is not editable");
      await tx.query(`UPDATE accounting_tax_policy_checks c SET status=$2,evidence=$3,decided_by=${actorUuidExpression(4)},decided_at=CASE WHEN $2='approved' THEN now() ELSE NULL END,updated_at=now() FROM accounting_tax_policies p WHERE c.policy_id=p.id AND p.public_id=$1 AND c.check_code='fiscalisation_channel'`,[input.policyId,input.route==='unselected'?'pending':'approved',`Selected route: ${input.route}. ${input.reason}`,principal.userId]);
      return{ok:true,version:text(r.rows[0].version)};
    },{isolation:"serializable"});
  }

  async updatePolicy(principal:SessionPrincipal,input:{policyId:string;sellerOfRecord:boolean;sellerLegalName:string;sellerTaxNumber:string;compatibilityTarget:string;productionPublishedSchema?:string;effectiveFrom?:string;reason:string}){
    const legalName=input.sellerLegalName.trim();if(legalName.length<3)throw new Error("Seller legal name is required");
    const taxNumber=input.sellerTaxNumber.trim();if(!/^\d{9}$/.test(taxNumber))throw new Error("Seller tax number must be a 9-digit Greek AFM");
    const target=input.compatibilityTarget.trim();if(!/^\d+\.\d+\.\d+$/.test(target))throw new Error("Compatibility target must use x.y.z format");
    const effective=input.effectiveFrom?.trim();if(effective&&!/^\d{4}-\d{2}-\d{2}$/.test(effective))throw new Error("Effective date must use YYYY-MM-DD");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const r=await tx.query<SqlRow>(`UPDATE accounting_tax_policies SET seller_of_record=$2,seller_legal_name=$3,seller_tax_number=$4,compatibility_target=$5,production_published_schema=NULLIF($6,''),effective_from=NULLIF($7,'')::date,status=CASE WHEN status='draft' THEN 'review' ELSE status END,approval_notes=concat_ws(E'\n',NULLIF(approval_notes,''),$8),updated_at=now() WHERE public_id=$1 AND status IN ('draft','review') RETURNING version`,[input.policyId,input.sellerOfRecord,legalName,taxNumber,target,input.productionPublishedSchema?.trim()||'',effective||'',input.reason]);
      if(!r.rowCount)throw new Error("Approved policies are immutable; create a new revision first");
      return{ok:true,version:text(r.rows[0].version)};
    },{isolation:"serializable"});
  }

  async createRevision(principal:SessionPrincipal,input:{policyId:string;version:string;reason:string}){
    const version=input.version.trim();if(!/^\d+\.\d+(?:\.\d+)?$/.test(version))throw new Error("Policy version must use numeric dotted format");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const source=await tx.query<SqlRow>(`SELECT id::text,status FROM accounting_tax_policies WHERE public_id=$1 FOR UPDATE`,[input.policyId]);
      if(!source.rowCount)throw new Error("Source accounting policy not found");
      if(text(source.rows[0].status)!=='approved')throw new Error("Create a revision only from an approved policy");
      const created=await tx.query<SqlRow>(`INSERT INTO accounting_tax_policies(market_id,version,status,seller_of_record,seller_legal_name,seller_tax_number,compatibility_target,production_published_schema,fiscalisation_route,effective_from,approval_notes)
        SELECT market_id,$2,'review',seller_of_record,seller_legal_name,seller_tax_number,compatibility_target,production_published_schema,fiscalisation_route,NULL,concat_ws(E'\n',$3,'Revision created from approved policy '||version)
        FROM accounting_tax_policies WHERE public_id=$1 RETURNING id::text,public_id`,[input.policyId,version,input.reason]);
      if(!created.rowCount)throw new Error("Unable to create accounting policy revision");
      const newId=text(created.rows[0].id);const newPublicId=text(created.rows[0].public_id);const sourceId=text(source.rows[0].id);
      await tx.query(`INSERT INTO accounting_tax_policy_checks(policy_id,check_code,label,required,status) SELECT $1::uuid,check_code,label,required,'pending' FROM accounting_tax_policy_checks WHERE policy_id=$2::uuid`,[newId,sourceId]);
      await tx.query(`INSERT INTO mydata_document_mappings(policy_id,event_code,customer_kind,item_kind,geography,direction,invoice_type,income_category,e3_code,series_code,production_status,negative_original_classification,correlation_required,notes)
        SELECT $1::uuid,event_code,customer_kind,item_kind,geography,direction,invoice_type,income_category,e3_code,series_code,CASE WHEN production_status='approved' THEN 'proposed' ELSE production_status END,negative_original_classification,correlation_required,notes FROM mydata_document_mappings WHERE policy_id=$2::uuid`,[newId,sourceId]);
      await tx.query(`INSERT INTO mydata_payment_mappings(policy_id,processor,processor_method,mydata_payment_type,requires_transaction_id,erp_requires_ecr_token,provider_signature_route,production_status,notes)
        SELECT $1::uuid,processor,processor_method,mydata_payment_type,requires_transaction_id,erp_requires_ecr_token,provider_signature_route,CASE WHEN production_status='approved' THEN 'proposed' ELSE production_status END,notes FROM mydata_payment_mappings WHERE policy_id=$2::uuid`,[newId,sourceId]);
      return{ok:true,policyId:newPublicId,version};
    },{isolation:"serializable"});
  }

  async decideCheck(principal:SessionPrincipal,input:{policyId:string;checkCode:string;status:PolicyDecisionStatus;evidence:string}){
    if(input.status==='pending')throw new Error("Use an explicit decision");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const r=await tx.query(`UPDATE accounting_tax_policy_checks c SET status=$3,evidence=$4,decided_by=${actorUuidExpression(5)},decided_at=now(),updated_at=now()
        FROM accounting_tax_policies p WHERE c.policy_id=p.id AND p.public_id=$1 AND c.check_code=$2 AND p.status IN ('draft','review')`,[input.policyId,input.checkCode,input.status,input.evidence,principal.userId]);
      if(!r.rowCount)throw new Error("Policy check was not found or policy is not editable");return{ok:true};
    },{isolation:"serializable"});
  }

  async decideDocumentMapping(principal:SessionPrincipal,input:{policyId:string;eventCode:string;status:MappingProductionStatus;reason:string}){
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{const r=await tx.query(`UPDATE mydata_document_mappings d SET production_status=$3,notes=concat_ws(E'\n',NULLIF(notes,''),$4) FROM accounting_tax_policies p WHERE d.policy_id=p.id AND p.public_id=$1 AND d.event_code=$2 AND p.status IN ('draft','review')`,[input.policyId,input.eventCode,input.status,input.reason]);if(!r.rowCount)throw new Error("Document mapping was not found or policy is not editable");return{ok:true};},{isolation:"serializable"});
  }

  async updateDocumentMapping(principal:SessionPrincipal,input:{policyId:string;eventCode:string;customerKind:string;itemKind:string;geography:string;direction:string;invoiceType:string;incomeCategory?:string;e3Code?:string;seriesCode:string;status:MappingProductionStatus;negativeOriginalClassification:boolean;correlationRequired:boolean;notes?:string;reason:string}){
    enumValue(input.customerKind,['b2c','b2b','none'],'customer kind');enumValue(input.itemKind,['goods','services','mixed','none'],'item kind');enumValue(input.geography,['domestic','eu','third_country','none'],'geography');enumValue(input.direction,['sale','credit','platform_service','delivery'],'direction');
    const invoiceType=input.invoiceType.trim();if(!invoiceType)throw new Error("Invoice type is required");const series=input.seriesCode.trim();if(!series)throw new Error("Fiscal series is required");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const seriesExists=await tx.query(`SELECT 1 FROM mydata_fiscal_series s JOIN markets m ON m.id=s.market_id WHERE m.code=$1 AND s.series=$2`,[this.#marketCode(),series]);if(!seriesExists.rowCount)throw new Error(`Fiscal series ${series} does not exist`);
      const r=await tx.query(`UPDATE mydata_document_mappings d SET customer_kind=$3,item_kind=$4,geography=$5,direction=$6,invoice_type=$7,income_category=NULLIF($8,''),e3_code=NULLIF($9,''),series_code=$10,production_status=$11,negative_original_classification=$12,correlation_required=$13,notes=concat_ws(E'\n',NULLIF($14,''),$15) FROM accounting_tax_policies p WHERE d.policy_id=p.id AND p.public_id=$1 AND d.event_code=$2 AND p.status IN ('draft','review')`,[input.policyId,input.eventCode,input.customerKind,input.itemKind,input.geography,input.direction,invoiceType,input.incomeCategory?.trim()||'',input.e3Code?.trim()||'',series,input.status,input.negativeOriginalClassification,input.correlationRequired,input.notes?.trim()||'',`Admin edit: ${input.reason}`]);
      if(!r.rowCount)throw new Error("Document mapping was not found or policy is not editable");return{ok:true};
    },{isolation:"serializable"});
  }

  async decidePaymentMapping(principal:SessionPrincipal,input:{policyId:string;processor:string;processorMethod:string;status:MappingProductionStatus;reason:string}){
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{const r=await tx.query(`UPDATE mydata_payment_mappings m SET production_status=$4,notes=concat_ws(E'\n',NULLIF(notes,''),$5) FROM accounting_tax_policies p WHERE m.policy_id=p.id AND p.public_id=$1 AND m.processor=$2 AND m.processor_method=$3 AND p.status IN ('draft','review')`,[input.policyId,input.processor,input.processorMethod,input.status,input.reason]);if(!r.rowCount)throw new Error("Payment mapping was not found or policy is not editable");return{ok:true};},{isolation:"serializable"});
  }

  async updatePaymentMapping(principal:SessionPrincipal,input:{policyId:string;processor:string;processorMethod:string;mydataPaymentType:number;requiresTransactionId:boolean;erpRequiresEcrToken:boolean;providerSignatureRoute:boolean;status:MappingProductionStatus;notes?:string;reason:string}){
    if(!Number.isSafeInteger(input.mydataPaymentType)||input.mydataPaymentType<1||input.mydataPaymentType>8)throw new Error("myDATA payment type must be 1-8");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{const r=await tx.query(`UPDATE mydata_payment_mappings m SET mydata_payment_type=$4,requires_transaction_id=$5,erp_requires_ecr_token=$6,provider_signature_route=$7,production_status=$8,notes=concat_ws(E'\n',NULLIF($9,''),$10) FROM accounting_tax_policies p WHERE m.policy_id=p.id AND p.public_id=$1 AND m.processor=$2 AND m.processor_method=$3 AND p.status IN ('draft','review')`,[input.policyId,input.processor,input.processorMethod,input.mydataPaymentType,input.requiresTransactionId,input.erpRequiresEcrToken,input.providerSignatureRoute,input.status,input.notes?.trim()||'',`Admin edit: ${input.reason}`]);if(!r.rowCount)throw new Error("Payment mapping was not found or policy is not editable");return{ok:true};},{isolation:"serializable"});
  }

  async updateFiscalSeries(principal:SessionPrincipal,input:{series:string;invoiceType:string;purpose:string;fiscalYear:number;nextAa:number;locked:boolean;reason:string}){
    if(!Number.isSafeInteger(input.fiscalYear)||input.fiscalYear<2020||input.fiscalYear>2200)throw new Error("Invalid fiscal year");if(!Number.isSafeInteger(input.nextAa)||input.nextAa<1)throw new Error("Next AA must be a positive integer");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const current=await tx.query<SqlRow>(`SELECT s.last_issued_aa,s.fiscal_year FROM mydata_fiscal_series s JOIN markets m ON m.id=s.market_id WHERE m.code=$1 AND s.series=$2 FOR UPDATE OF s`,[this.#marketCode(),input.series]);if(!current.rowCount)throw new Error("Fiscal series not found");
      const last=intOptional(current.rows[0].last_issued_aa);if(last!==undefined&&input.nextAa<=last)throw new Error(`Next AA must remain greater than last issued AA ${last}`);if(last!==undefined&&input.fiscalYear!==int(current.rows[0].fiscal_year))throw new Error("Fiscal year cannot be changed after a series has issued documents");
      await tx.query(`UPDATE mydata_fiscal_series s SET invoice_type=$3,purpose=$4,fiscal_year=$5,next_aa=$6,locked=$7,updated_at=now() FROM markets m WHERE s.market_id=m.id AND m.code=$1 AND s.series=$2`,[this.#marketCode(),input.series,input.invoiceType.trim(),input.purpose.trim(),input.fiscalYear,input.nextAa,input.locked]);
      return{ok:true,reason:input.reason};
    },{isolation:"serializable"});
  }

  async updateVatCategory(principal:SessionPrincipal,input:{code:number;rateBps:number;label:string;specialCategory:boolean;reason:string}){
    if(!Number.isSafeInteger(input.code)||input.code<1||input.code>10)throw new Error("VAT category code must be 1-10");if(!Number.isSafeInteger(input.rateBps)||input.rateBps<0||input.rateBps>10000)throw new Error("VAT rate basis points are invalid");if(input.label.trim().length<2)throw new Error("VAT category label is required");
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{const r=await tx.query(`UPDATE mydata_vat_category_catalog SET rate_bps=$2,label=$3,special_category=$4 WHERE code=$1`,[input.code,input.rateBps,input.label.trim(),input.specialCategory]);if(!r.rowCount)throw new Error("VAT category not found");return{ok:true,reason:input.reason};},{isolation:"serializable"});
  }

  async approvePolicy(principal:SessionPrincipal,input:{policyId:string;accountantName:string;reason:string;now?:number}){
    const now=input.now??Date.now();
    const snapshot=await this.workspace(principal,now);
    if(!snapshot.policy||snapshot.policy.id!==input.policyId)throw new Error("Accounting policy was not found or another editable revision is active");
    const blockers=policyBlockers(snapshot);
    if(blockers.length)throw new Error(`Accounting policy cannot be approved: ${blockers.join("; ")}`);
    const hash=policyHash(snapshot);
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      await tx.query(`UPDATE accounting_tax_policies SET status='retired',updated_at=$2 WHERE market_id=(SELECT market_id FROM accounting_tax_policies WHERE public_id=$1) AND status='approved'`,[input.policyId,new Date(now)]);
      const r=await tx.query<SqlRow>(`UPDATE accounting_tax_policies SET status='approved',accountant_name=$2,approved_by=${actorUuidExpression(3)},approved_at=$4,effective_from=COALESCE(effective_from,$4::date),approval_notes=concat_ws(E'\n',NULLIF(approval_notes,''),$5),policy_hash=$6,updated_at=$4 WHERE public_id=$1 AND status IN ('draft','review') RETURNING version`,[input.policyId,input.accountantName.trim(),principal.userId,new Date(now),input.reason,hash]);
      if(!r.rowCount)throw new Error("Accounting policy is no longer editable");return{ok:true,version:text(r.rows[0].version),policyHash:hash};
    },{isolation:"serializable"});
  }

  async approvedPolicyForIssuance(principal:SessionPrincipal, now=Date.now()){
    const snapshot=await this.workspace(principal,now);return snapshot.policy?.status==='approved'&&snapshot.productionReady?snapshot:undefined;
  }

  #marketCode(){return this.#env.DEFAULT_MARKET?.trim()||"sparta";}
}

function policyBlockers(input:{policy?:AccountingPolicyWorkspace["policy"];checks:AccountingPolicyWorkspace["checks"];documentMappings:AccountingPolicyWorkspace["documentMappings"];paymentMappings:AccountingPolicyWorkspace["paymentMappings"];taxProfileCoverage:AccountingPolicyWorkspace["taxProfileCoverage"];technicalCapabilities:AccountingPolicyWorkspace["technicalCapabilities"]}):string[]{
  const p=input.policy;if(!p)return["Accounting policy is missing"];
  const blockers:string[]=[];
  if(!p.sellerOfRecord)blockers.push("Seller-of-record model is not approved");
  if(p.fiscalisationRoute==='unselected')blockers.push("Fiscalisation route is not selected");
  for(const c of input.checks)if(c.required&&!['approved','not_applicable'].includes(c.status))blockers.push(`Required check ${c.code} is ${c.status}`);
  const requiredDocs=['b2c_goods_gr','b2b_goods_gr','b2c_services_gr','b2b_services_gr','b2c_credit','b2b_credit_correlated','platform_vendor_service'];
  for(const code of requiredDocs){const m=input.documentMappings.find(x=>x.eventCode===code);if(!m||m.status!=='approved')blockers.push(`Document mapping ${code} is not approved`);}
  const requiredPayments=[['VIVA','CARD'],['VIVA','IRIS'],['OFFLINE','CASH'],['OFFLINE','CREDIT'],['OFFLINE','WEB_BANKING']] as const;
  for(const [processor,method] of requiredPayments){const m=input.paymentMappings.find(x=>x.processor===processor&&x.processorMethod===method);if(!m||m.status!=='approved')blockers.push(`Payment mapping ${processor}/${method} is not approved`);}
  if(input.taxProfileCoverage.missingVariants>0)blockers.push(`${input.taxProfileCoverage.missingVariants} active product(s) lack an approved effective VAT profile`);
  if(p.fiscalisationRoute==='aade_direct_erp'&&!input.technicalCapabilities.directErpEcrToken)blockers.push("Direct ERP card fiscalisation has no enabled ECRToken capability");
  if(p.fiscalisationRoute==='viva_fiscal_provider'&&!input.technicalCapabilities.vivaFiscalProvider)blockers.push("Viva Fiscal provider integration is not enabled");
  return[...new Set(blockers)];
}

function runtimeConfigFromValue(raw:unknown,env:NodeJS.ProcessEnv):AccountingPolicyWorkspace['runtimeConfig']{
  const value=jsonRecord(raw);const environment=value.environment==='test'?'test':value.environment==='production'?'production':env.AADE_MYDATA_ENVIRONMENT==='test'?'test':'production';const timeout=Number(value.requestTimeoutMs);
  return{environment,specVersion:typeof value.specVersion==='string'&&value.specVersion.trim()?value.specVersion.trim():env.AADE_MYDATA_SPEC_VERSION?.trim()||'2.0.2',requestTimeoutMs:Number.isSafeInteger(timeout)&&timeout>0?timeout:15000,issuanceEnabled:typeof value.issuanceEnabled==='boolean'?value.issuanceEnabled:env.BLS_MYDATA_ISSUANCE_ENABLED==='true',ecrTokenEnabled:typeof value.ecrTokenEnabled==='boolean'?value.ecrTokenEnabled:env.BLS_MYDATA_ECR_TOKEN_ENABLED==='true',vivaFiscalEnabled:typeof value.vivaFiscalEnabled==='boolean'?value.vivaFiscalEnabled:env.BLS_VIVA_FISCAL_ENABLED==='true',mappingVersionPin:typeof value.mappingVersionPin==='string'&&value.mappingVersionPin.trim()?value.mappingVersionPin.trim():env.BLS_MYDATA_MAPPING_VERSION?.trim()||undefined,capturePaidOrders:typeof value.capturePaidOrders==='boolean'?value.capturePaidOrders:true,emailAcceptedDocuments:typeof value.emailAcceptedDocuments==='boolean'?value.emailAcceptedDocuments:true};
}
function policyHash(s:AccountingPolicyWorkspace):string{return createHash('sha256').update(JSON.stringify({version:s.policy?.version,sellerOfRecord:s.policy?.sellerOfRecord,sellerLegalName:s.policy?.sellerLegalName,sellerTaxNumber:s.policy?.sellerTaxNumber,compatibilityTarget:s.policy?.compatibilityTarget,productionPublishedSchema:s.policy?.productionPublishedSchema,fiscalisationRoute:s.policy?.fiscalisationRoute,checks:s.checks.map(x=>[x.code,x.status,x.evidence]),documents:s.documentMappings.map(x=>[x.eventCode,x.customerKind,x.itemKind,x.geography,x.direction,x.invoiceType,x.incomeCategory,x.e3Code,x.seriesCode,x.status,x.correlationRequired,x.negativeOriginalClassification]),payments:s.paymentMappings.map(x=>[x.processor,x.processorMethod,x.mydataPaymentType,x.requiresTransactionId,x.erpRequiresEcrToken,x.providerSignatureRoute,x.status]),series:s.series.map(x=>[x.series,x.invoiceType,x.fiscalYear]),productTaxProfileHashes:s.taxProfileCoverage.approvedProfileHashes})).digest('hex');}
function actorUuidExpression(index:number){return `(SELECT u.id FROM users u WHERE u.id::text=$${index} OR u.public_id=$${index} LIMIT 1)`;}
function enumValue(value:string,allowed:readonly string[],label:string){if(!allowed.includes(value))throw new Error(`Unsupported ${label}`);}
function jsonRecord(v:unknown):Record<string,unknown>{if(v&&typeof v==='object'&&!Array.isArray(v))return v as Record<string,unknown>;if(typeof v==='string')try{const p=JSON.parse(v);return p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch{return{}}return{};}
function athensDate(now:number):string{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const m=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;}
function text(v:unknown):string{if(typeof v!=='string'||!v)throw new Error('Invalid database text');return v;}function optional(v:unknown):string|undefined{return typeof v==='string'&&v?v:undefined;}function bool(v:unknown):boolean{return v===true;}function int(v:unknown):number{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error('Invalid database integer');return n;}function intOptional(v:unknown):number|undefined{return v==null?undefined:int(v);}function epochOptional(v:unknown):number|undefined{if(v==null)return undefined;const n=v instanceof Date?v.getTime():new Date(String(v)).getTime();return Number.isFinite(n)?n:undefined;}function dateValue(v:unknown):string|undefined{if(v==null)return undefined;return v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);}

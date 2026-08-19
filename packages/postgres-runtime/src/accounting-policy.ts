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
  technicalCapabilities: Readonly<{ directErpEcrToken:boolean; vivaFiscalProvider:boolean }>;
  productionReady:boolean;
  blockers:readonly string[];
}>;

export class PostgresAccountingPolicyService {
  readonly #uow:PostgresUnitOfWork;
  readonly #env:NodeJS.ProcessEnv;
  constructor(pool:SqlPool, env:NodeJS.ProcessEnv=process.env){this.#uow=new PostgresUnitOfWork(pool);this.#env=env;}

  async workspace(principal:SessionPrincipal, now=Date.now()):Promise<AccountingPolicyWorkspace>{
    return this.#uow.withTransaction(platformScope(principal.userId), async tx => {
      const p=await tx.query<SqlRow>(`SELECT public_id,version,status,seller_of_record,seller_legal_name,seller_tax_number,compatibility_target,
          production_published_schema,fiscalisation_route,effective_from,accountant_name,approved_at,approval_notes,policy_hash
        FROM accounting_tax_policies
        WHERE market_id=(SELECT id FROM markets WHERE code=$1 LIMIT 1)
        ORDER BY CASE status WHEN 'approved' THEN 0 WHEN 'review' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, created_at DESC LIMIT 1`,[this.#marketCode()]);
      if(!p.rowCount)return{checks:[],documentMappings:[],paymentMappings:[],series:[],vatCategories:[],taxProfileCoverage:{activeVariants:0,coveredVariants:0,missingVariants:0,approvedProfiles:0,unapprovedProfiles:0,approvedProfileHashes:[]},technicalCapabilities:this.#capabilities(),productionReady:false,blockers:["Accounting policy has not been created"]};
      const row=p.rows[0], policyId=text(row.public_id);
      const [checks,docs,payments,series,vat,coverage,profileHashes]=await Promise.all([
        tx.query<SqlRow>(`SELECT c.check_code,c.label,c.required,c.status,c.evidence,c.decided_at FROM accounting_tax_policy_checks c JOIN accounting_tax_policies p ON p.id=c.policy_id WHERE p.public_id=$1 ORDER BY c.required DESC,c.check_code`,[policyId]),
        tx.query<SqlRow>(`SELECT d.event_code,d.customer_kind,d.item_kind,d.geography,d.direction,d.invoice_type,d.income_category,d.e3_code,d.series_code,d.production_status,d.negative_original_classification,d.correlation_required,d.notes FROM mydata_document_mappings d JOIN accounting_tax_policies p ON p.id=d.policy_id WHERE p.public_id=$1 ORDER BY d.event_code`,[policyId]),
        tx.query<SqlRow>(`SELECT m.processor,m.processor_method,m.mydata_payment_type,m.requires_transaction_id,m.erp_requires_ecr_token,m.provider_signature_route,m.production_status,m.notes FROM mydata_payment_mappings m JOIN accounting_tax_policies p ON p.id=m.policy_id WHERE p.public_id=$1 ORDER BY m.processor,m.processor_method`,[policyId]),
        tx.query<SqlRow>(`SELECT s.series,s.invoice_type,s.purpose,s.fiscal_year,s.next_aa,s.last_issued_aa,s.last_mark,s.locked FROM mydata_fiscal_series s JOIN accounting_tax_policies p ON p.id=s.policy_id WHERE p.public_id=$1 ORDER BY s.series`,[policyId]),
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
      const technicalCapabilities=this.#capabilities();
      const blockers=policyBlockers({policy,checks:checkRows,documentMappings:docRows,paymentMappings:payRows,taxProfileCoverage,technicalCapabilities});
      return{policy,checks:checkRows,documentMappings:docRows,paymentMappings:payRows,series:seriesRows,vatCategories:vatRows,taxProfileCoverage,technicalCapabilities,productionReady:policy.status==='approved'&&blockers.length===0,blockers};
    },{readOnly:true});
  }

  async setFiscalisationRoute(principal:SessionPrincipal,input:{policyId:string;route:Exclude<FiscalisationRoute,"unselected">;reason:string}){
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const r=await tx.query<SqlRow>(`UPDATE accounting_tax_policies SET fiscalisation_route=$2,status=CASE WHEN status='draft' THEN 'review' ELSE status END,approval_notes=concat_ws(E'\n',NULLIF(approval_notes,''),$3),updated_at=now()
        WHERE public_id=$1 AND status IN ('draft','review') RETURNING version`,[input.policyId,input.route,`Fiscalisation route: ${input.route}. ${input.reason}`]);
      if(!r.rowCount)throw new Error("Accounting policy is not editable");
      await tx.query(`UPDATE accounting_tax_policy_checks c SET status='approved',evidence=$2,decided_by=${actorUuidExpression(3)},decided_at=now(),updated_at=now() FROM accounting_tax_policies p WHERE c.policy_id=p.id AND p.public_id=$1 AND c.check_code='fiscalisation_channel'`,[input.policyId,`Selected route: ${input.route}. ${input.reason}`,principal.userId]);
      return{ok:true,version:text(r.rows[0].version)};
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

  async decidePaymentMapping(principal:SessionPrincipal,input:{policyId:string;processor:string;processorMethod:string;status:MappingProductionStatus;reason:string}){
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{const r=await tx.query(`UPDATE mydata_payment_mappings m SET production_status=$4,notes=concat_ws(E'\n',NULLIF(notes,''),$5) FROM accounting_tax_policies p WHERE m.policy_id=p.id AND p.public_id=$1 AND m.processor=$2 AND m.processor_method=$3 AND p.status IN ('draft','review')`,[input.policyId,input.processor,input.processorMethod,input.status,input.reason]);if(!r.rowCount)throw new Error("Payment mapping was not found or policy is not editable");return{ok:true};},{isolation:"serializable"});
  }

  async approvePolicy(principal:SessionPrincipal,input:{policyId:string;accountantName:string;reason:string;now?:number}){
    const now=input.now??Date.now();
    const snapshot=await this.workspace(principal,now);
    if(!snapshot.policy||snapshot.policy.id!==input.policyId)throw new Error("Accounting policy was not found");
    const blockers=policyBlockers(snapshot);
    if(blockers.length)throw new Error(`Accounting policy cannot be approved: ${blockers.join("; ")}`);
    const hash=policyHash(snapshot);
    return this.#uow.withTransaction(platformScope(principal.userId),async tx=>{
      const r=await tx.query<SqlRow>(`UPDATE accounting_tax_policies SET status='approved',accountant_name=$2,approved_by=${actorUuidExpression(3)},approved_at=$4,effective_from=COALESCE(effective_from,$4::date),approval_notes=concat_ws(E'\n',NULLIF(approval_notes,''),$5),policy_hash=$6,updated_at=$4 WHERE public_id=$1 AND status IN ('draft','review') RETURNING version`,[input.policyId,input.accountantName.trim(),principal.userId,new Date(now),input.reason,hash]);
      if(!r.rowCount)throw new Error("Accounting policy is no longer editable");return{ok:true,version:text(r.rows[0].version),policyHash:hash};
    },{isolation:"serializable"});
  }

  async approvedPolicyForIssuance(principal:SessionPrincipal, now=Date.now()){
    const snapshot=await this.workspace(principal,now);return snapshot.productionReady?snapshot:undefined;
  }

  #marketCode(){return this.#env.DEFAULT_MARKET?.trim()||"sparta";}
  #capabilities(){return{directErpEcrToken:this.#env.BLS_MYDATA_ECR_TOKEN_ENABLED==='true',vivaFiscalProvider:this.#env.BLS_VIVA_FISCAL_ENABLED==='true'};}
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

function policyHash(s:AccountingPolicyWorkspace):string{return createHash('sha256').update(JSON.stringify({version:s.policy?.version,sellerOfRecord:s.policy?.sellerOfRecord,compatibilityTarget:s.policy?.compatibilityTarget,fiscalisationRoute:s.policy?.fiscalisationRoute,checks:s.checks.map(x=>[x.code,x.status,x.evidence]),documents:s.documentMappings.map(x=>[x.eventCode,x.invoiceType,x.incomeCategory,x.e3Code,x.seriesCode,x.status]),payments:s.paymentMappings.map(x=>[x.processor,x.processorMethod,x.mydataPaymentType,x.status]),series:s.series.map(x=>[x.series,x.invoiceType,x.fiscalYear]),productTaxProfileHashes:s.taxProfileCoverage.approvedProfileHashes})).digest('hex');}
function actorUuidExpression(index:number){return `(SELECT u.id FROM users u WHERE u.id::text=$${index} OR u.public_id=$${index} LIMIT 1)`;}
function athensDate(now:number):string{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Athens',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const m=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;}
function text(v:unknown):string{if(typeof v!=='string'||!v)throw new Error('Invalid database text');return v;}function optional(v:unknown):string|undefined{return typeof v==='string'&&v?v:undefined;}function bool(v:unknown):boolean{return v===true;}function int(v:unknown):number{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error('Invalid database integer');return n;}function intOptional(v:unknown):number|undefined{return v==null?undefined:int(v);}function epochOptional(v:unknown):number|undefined{if(v==null)return undefined;const n=v instanceof Date?v.getTime():new Date(String(v)).getTime();return Number.isFinite(n)?n:undefined;}function dateValue(v:unknown):string|undefined{if(v==null)return undefined;return v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);}

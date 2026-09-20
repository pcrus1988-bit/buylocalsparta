import { randomUUID } from "node:crypto";
import { escapeXml, splitVatInclusiveGross } from "@buy-local-sparta/aade-mydata";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { reconcileCustomerFiscalDocument } from "./customer-fiscal-reconciliation";
import { configuredMyDataService, myDataAdminRuntimeConfig } from "./mydata-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const INVOICE_NS="http://www.aade.gr/myDATA/invoice/v1.0";
const INCOME_NS="https://www.aade.gr/myDATA/incomeClassificaton/v1.0";

const SYSTEM_FISCAL_PRINCIPAL:SessionPrincipal={
  userId:"system_spv_fiscalization",
  email:"system-spv-fiscalization@kontamou.local",
  roles:["platform_finance"],
  csrfToken:"system",
  sessionId:"system-spv-fiscalization"
};

export type SpvIssueFiscalization=Readonly<{
  giftCardId:string;
  documentId?:string;
  documentNumber?:string;
  fiscalStatus:"disabled"|"ready"|"accepted"|"rejected"|"manual_review";
  aadeMark?:string;
  error?:string;
}>;

export async function fiscalizeVendorPhysicalSpvIssue(giftCardId:string,now=Date.now()):Promise<SpvIssueFiscalization>{
  if(!productionDatabaseConfigured())return{giftCardId,fiscalStatus:"disabled"};
  const config=await myDataAdminRuntimeConfig();
  const prepared=await prepareVendorPhysicalSpvIssue(giftCardId,now);
  if(prepared.fiscalStatus==="accepted")return prepared;
  if(!config.issuanceEnabled)return prepared;

  if(prepared.documentId&&prepared.documentNumber&&["manual_review","rejected"].includes(prepared.fiscalStatus)){
    try{
      await reconcileCustomerFiscalDocument(prepared.documentId,now);
      const reconciled=await spvFiscalSnapshot(giftCardId,prepared.documentId);
      if(reconciled.fiscalStatus==="accepted")return reconciled;
    }catch{
      // Keep the governed manual-review state. A numbered fiscal document must never be blindly resent.
    }
    return spvFiscalSnapshot(giftCardId,prepared.documentId);
  }

  if(!prepared.documentId)return prepared;
  try{
    const service=await configuredMyDataService();
    if(!service)throw new Error("AADE myDATA service is not configured");
    const transmission=await service.transmitPreparedDocument(SYSTEM_FISCAL_PRINCIPAL,{documentId:prepared.documentId,now});
    if(transmission.ok&&transmission.items.length>0&&!transmission.items.some(item=>item.invoiceMark)){
      await reconcileCustomerFiscalDocument(prepared.documentId,Date.now()).catch(()=>undefined);
    }
    return spvFiscalSnapshot(giftCardId,prepared.documentId);
  }catch(error){
    const message=error instanceof Error?error.message:"SPV AADE fiscalization failed";
    await getProductionPostgresRuntime().nativePool.query(
      `UPDATE tax_documents
          SET transmission_status=CASE WHEN transmission_status IN ('not_ready','ready') THEN 'manual_review' ELSE transmission_status END,
              last_error=CASE WHEN transmission_status='accepted' THEN last_error ELSE $2 END
        WHERE public_id=$1`,
      [prepared.documentId,message.slice(0,1000)]
    ).catch(()=>undefined);
    return{...(await spvFiscalSnapshot(giftCardId,prepared.documentId)),error:message};
  }
}

export async function backfillVendorPhysicalSpvIssues(limit=5,now=Date.now()):Promise<{checked:number;accepted:number;failed:number}>{
  if(!productionDatabaseConfigured())return{checked:0,accepted:0,failed:0};
  if(!Number.isSafeInteger(limit)||limit<1||limit>25)throw new Error("SPV fiscal backfill limit must be between 1 and 25");
  const db=getProductionPostgresRuntime().nativePool;
  const cards=await db.query<{public_id:string}>(`
    SELECT gc.public_id
      FROM gift_cards gc
      JOIN gift_card_ledger issue ON issue.gift_card_id=gc.id AND issue.entry_type='issue'
     WHERE gc.issue_channel='vendor_physical'
       AND gc.voucher_type='single_purpose'
       AND gc.voucher_tax_country='GR'
       AND gc.voucher_vat_rate_bps=2400
       AND issue.reason='vendor_physical_cash_issue'
       AND COALESCE((issue.metadata->>'cashPaymentConfirmed')::boolean,false)=true
       AND NOT EXISTS (
         SELECT 1 FROM tax_documents td
         WHERE td.gift_card_id=gc.id
       )
     ORDER BY gc.issued_at ASC
     LIMIT $1
  `,[limit]);
  let accepted=0,failed=0;
  for(const card of cards.rows){
    try{
      const result=await fiscalizeVendorPhysicalSpvIssue(card.public_id,now);
      if(result.fiscalStatus==="accepted")accepted+=1;
      else failed+=1;
    }catch(error){
      failed+=1;
      console.error(JSON.stringify({level:"error",event:"gift_card.spv_fiscal_backfill_failed",giftCardId:card.public_id,message:error instanceof Error?error.message:String(error)}));
    }
  }
  return{checked:cards.rowCount??cards.rows.length,accepted,failed};
}

async function prepareVendorPhysicalSpvIssue(giftCardId:string,now:number):Promise<SpvIssueFiscalization>{
  const db=getProductionPostgresRuntime().nativePool;
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bls_mydata_fiscal_prepare'))");
    const cardResult=await client.query<{
      gift_card_uuid:string;public_id:string;market_id:string;issued_by_vendor_id:string|null;initial_value_minor:string|number;
      voucher_type:string;voucher_vat_rate_bps:number;voucher_tax_country:string;issued_at:Date;issue_reason:string|null;issue_metadata:Record<string,unknown>|null;
    }>(`
      SELECT gc.id::text AS gift_card_uuid,gc.public_id,gc.market_id::text,gc.issued_by_vendor_id::text,
             gc.initial_value_minor,gc.voucher_type,gc.voucher_vat_rate_bps,gc.voucher_tax_country::text,gc.issued_at,
             issue.reason AS issue_reason,issue.metadata AS issue_metadata
        FROM gift_cards gc
        LEFT JOIN LATERAL (
          SELECT gcl.reason,gcl.metadata FROM gift_card_ledger gcl
          WHERE gcl.gift_card_id=gc.id AND gcl.entry_type='issue'
          ORDER BY gcl.created_at ASC LIMIT 1
        ) issue ON true
       WHERE gc.public_id=$1
       FOR UPDATE OF gc
    `,[giftCardId]);
    if(!cardResult.rowCount)throw new Error("Gift Card not found");
    const card=cardResult.rows[0]!;
    if(card.voucher_type!=="single_purpose"||card.voucher_tax_country.trim()!=="GR"||integer(card.voucher_vat_rate_bps)!==2400)throw new Error("Gift Card is not an approved Greek 24% single-purpose voucher");
    const issueMetadata=record(card.issue_metadata);
    if(card.issue_reason!=="vendor_physical_cash_issue"||issueMetadata.cashPaymentConfirmed!==true)throw new Error("Automatic SPV fiscalization requires confirmed vendor-physical cash consideration");

    const existing=await client.query<{public_id:string;document_number:string|null;transmission_status:string;aade_mark:string|null;last_error:string|null}>(`
      SELECT public_id,document_number,transmission_status,aade_mark,last_error
      FROM tax_documents WHERE gift_card_id=$1::uuid
      ORDER BY created_at DESC LIMIT 1
    `,[card.gift_card_uuid]);
    if(existing.rowCount){
      await client.query("COMMIT");
      const row=existing.rows[0]!;
      return{giftCardId,documentId:row.public_id,documentNumber:row.document_number??undefined,fiscalStatus:normalizeStatus(row.transmission_status),aadeMark:row.aade_mark??undefined,error:row.last_error??undefined};
    }

    const policy=await client.query<{id:string;public_id:string;version:string;policy_hash:string|null;seller_tax_number:string;fiscalisation_route:string}>(`
      SELECT id::text,public_id,version,policy_hash,seller_tax_number,fiscalisation_route
      FROM accounting_tax_policies
      WHERE market_id=$1::uuid AND status='approved'
      ORDER BY approved_at DESC LIMIT 1 FOR SHARE
    `,[card.market_id]);
    if(!policy.rowCount)throw new Error("No approved Accounting Policy exists for this market");
    const p=policy.rows[0]!;
    if(p.fiscalisation_route!=="aade_direct_erp")throw new Error("SPV fiscalization requires the approved AADE Direct ERP route");

    const mapping=await client.query<{invoice_type:string;income_category:string;e3_code:string;series_code:string;production_status:string}>(`
      SELECT invoice_type,income_category,e3_code,series_code,production_status
      FROM mydata_document_mappings
      WHERE policy_id=$1::uuid AND event_code='b2c_goods_gr'
      LIMIT 1
    `,[p.id]);
    if(!mapping.rowCount||mapping.rows[0]!.production_status!=="approved")throw new Error("Approved B2C goods myDATA mapping is missing for SPV issuance");
    const m=mapping.rows[0]!;
    if(!m.income_category||!m.e3_code)throw new Error("SPV B2C mapping is missing income classification");

    const payment=await client.query<{mydata_payment_type:number;production_status:string}>(`
      SELECT mydata_payment_type,production_status
      FROM mydata_payment_mappings
      WHERE policy_id=$1::uuid AND processor='OFFLINE' AND processor_method='CASH'
      LIMIT 1
    `,[p.id]);
    if(!payment.rowCount||payment.rows[0]!.production_status!=="approved")throw new Error("Approved cash myDATA payment mapping is missing for SPV issuance");
    const paymentType=integer(payment.rows[0]!.mydata_payment_type);

    const issueDate=athensDate(card.issued_at.getTime());
    const series=await client.query<{id:string;series:string;invoice_type:string;fiscal_year:number;next_aa:string|number;locked:boolean}>(`
      SELECT id::text,series,invoice_type,fiscal_year,next_aa,locked
      FROM mydata_fiscal_series
      WHERE market_id=$1::uuid AND series=$2
      FOR UPDATE
    `,[card.market_id,m.series_code]);
    if(!series.rowCount)throw new Error(`Fiscal series ${m.series_code} is not configured`);
    const s=series.rows[0]!;
    if(s.locked)throw new Error(`Fiscal series ${s.series} is locked`);
    if(integer(s.fiscal_year)!==Number(issueDate.slice(0,4)))throw new Error(`Fiscal series ${s.series} belongs to ${s.fiscal_year}, not ${issueDate.slice(0,4)}`);

    const grossMinor=integer(card.initial_value_minor);
    const {netMinor,vatMinor}=splitVatInclusiveGross(grossMinor,2400);
    const aa=String(integer(s.next_aa));
    const documentNumber=`${s.series}-${aa}`;
    const xml=buildSpvIssueXml({
      sellerTaxNumber:p.seller_tax_number,series:s.series,aa,issueDate,invoiceType:m.invoice_type,
      paymentType,grossMinor,netMinor,vatMinor,incomeCategory:m.income_category,e3Code:m.e3_code
    });
    const documentId=`tax_spv_${randomUUID().replaceAll("-","")}`;
    const payload={
      lifecycle:"prepared_for_aade",
      eventCode:"spv_issue",
      giftCard:{publicId:card.public_id,voucherType:"single_purpose",vatRateBps:2400,taxCountry:"GR",issueChannel:"vendor_physical"},
      taxation:{vatRecognizedAt:"issue_or_transfer",redemptionIsSeparateVatTransaction:false},
      preparation:{accountingPolicyPublicId:p.public_id,policyVersion:p.version,policyHash:p.policy_hash,invoiceType:m.invoice_type,series:s.series,aa,issueDate,payment:{processor:"OFFLINE",processorMethod:"CASH",mydataPaymentType:paymentType},totals:{netMinor,vatMinor,grossMinor}},
      mydataXml:xml
    };
    await client.query(`
      INSERT INTO tax_documents(
        public_id,market_id,vendor_id,type,document_number,provider,currency,net_minor,tax_minor,gross_minor,status,payload_snapshot,
        mapping_version,invoice_type_code,document_series,document_aa,issue_date,transmission_status,accounting_policy_id,
        fiscalisation_route,payment_processor,payment_processor_method,mydata_payment_type,gift_card_id,created_at
      ) VALUES(
        $1,$2::uuid,$3::uuid,'retail_receipt',$4,'aade_mydata','EUR',$5,$6,$7,'pending',$8::jsonb,
        $9,$10,$11,$12,$13::date,'ready',$14::uuid,'aade_direct_erp','OFFLINE','CASH',$15,$16::uuid,$17
      )
    `,[documentId,card.market_id,card.issued_by_vendor_id,documentNumber,netMinor,vatMinor,grossMinor,JSON.stringify(payload),p.version,m.invoice_type,s.series,aa,issueDate,p.id,paymentType,card.gift_card_uuid,new Date(now)]);
    await client.query("UPDATE mydata_fiscal_series SET next_aa=next_aa+1,updated_at=now() WHERE id=$1::uuid",[s.id]);
    await client.query("COMMIT");
    return{giftCardId,documentId,documentNumber,fiscalStatus:"ready"};
  }catch(error){
    await client.query("ROLLBACK").catch(()=>undefined);
    throw error;
  }finally{client.release();}
}

async function spvFiscalSnapshot(giftCardId:string,documentId:string):Promise<SpvIssueFiscalization>{
  const row=(await getProductionPostgresRuntime().nativePool.query<{document_number:string|null;transmission_status:string;aade_mark:string|null;last_error:string|null}>(
    "SELECT document_number,transmission_status,aade_mark,last_error FROM tax_documents WHERE public_id=$1 LIMIT 1",[documentId]
  )).rows[0];
  if(!row)return{giftCardId,documentId,fiscalStatus:"manual_review",error:"SPV fiscal document disappeared"};
  return{giftCardId,documentId,documentNumber:row.document_number??undefined,fiscalStatus:normalizeStatus(row.transmission_status),aadeMark:row.aade_mark??undefined,error:row.last_error??undefined};
}

function buildSpvIssueXml(input:{sellerTaxNumber:string;series:string;aa:string;issueDate:string;invoiceType:string;paymentType:number;grossMinor:number;netMinor:number;vatMinor:number;incomeCategory:string;e3Code:string}):string{
  return `<?xml version="1.0" encoding="UTF-8"?><InvoicesDoc xmlns="${INVOICE_NS}" xmlns:icls="${INCOME_NS}"><invoice><issuer><vatNumber>${escapeXml(input.sellerTaxNumber)}</vatNumber><country>GR</country><branch>0</branch></issuer><invoiceHeader><series>${escapeXml(input.series)}</series><aa>${escapeXml(input.aa)}</aa><issueDate>${input.issueDate}</issueDate><invoiceType>${escapeXml(input.invoiceType)}</invoiceType><currency>EUR</currency></invoiceHeader><paymentMethods><paymentMethodDetails><type>${input.paymentType}</type><amount>${money(input.grossMinor)}</amount></paymentMethodDetails></paymentMethods><invoiceDetails><lineNumber>1</lineNumber><quantity>1</quantity><measurementUnit>1</measurementUnit><netValue>${money(input.netMinor)}</netValue><vatCategory>1</vatCategory><vatAmount>${money(input.vatMinor)}</vatAmount><incomeClassification><icls:classificationType>${escapeXml(input.e3Code)}</icls:classificationType><icls:classificationCategory>${escapeXml(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(input.netMinor)}</icls:amount></incomeClassification></invoiceDetails><invoiceSummary><totalNetValue>${money(input.netMinor)}</totalNetValue><totalVatAmount>${money(input.vatMinor)}</totalVatAmount><totalWithheldAmount>0.00</totalWithheldAmount><totalFeesAmount>0.00</totalFeesAmount><totalStampDutyAmount>0.00</totalStampDutyAmount><totalOtherTaxesAmount>0.00</totalOtherTaxesAmount><totalDeductionsAmount>0.00</totalDeductionsAmount><totalGrossValue>${money(input.grossMinor)}</totalGrossValue><incomeClassification><icls:classificationType>${escapeXml(input.e3Code)}</icls:classificationType><icls:classificationCategory>${escapeXml(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(input.netMinor)}</icls:amount></incomeClassification></invoiceSummary></invoice></InvoicesDoc>`;
}

function normalizeStatus(value:string):SpvIssueFiscalization["fiscalStatus"]{
  if(["ready","accepted","rejected","manual_review"].includes(value))return value as SpvIssueFiscalization["fiscalStatus"];
  return"manual_review";
}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function integer(value:unknown):number{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error("Expected safe integer value");return n;}
function money(minor:number):string{return(minor/100).toFixed(2);}
function athensDate(now:number):string{const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now));const m=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;}

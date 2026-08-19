import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const INVOICE_NS="http://www.aade.gr/myDATA/invoice/v1.0";
const INCOME_NS="https://www.aade.gr/myDATA/incomeClassificaton/v1.0";

type PrepareInput=Readonly<{
  documentId:string;
  eventCode:string;
  processor:string;
  processorMethod:string;
  paymentTid?:string;
  ecrSigningAuthor?:string;
  ecrSignature?:string;
  reason:string;
}>;

type PreparedResult=Readonly<{ok:true;documentId:string;documentNumber:string;invoiceType:string;series:string;aa:string;issueDate:string;mappingVersion:string;paymentType:number}>;

export async function adminPrepareCustomerFiscalDocument(principal:SessionPrincipal,input:PrepareInput):Promise<PreparedResult>{
  assertAdminPermission(principal,"finance.write");
  const result=await prepareCustomerFiscalDocument(input);
  await recordAdminAudit(principal,"mydata.customer_document_prepared","tax_document",input.documentId,input.reason,{
    eventCode:input.eventCode,processor:input.processor,processorMethod:input.processorMethod,documentNumber:result.documentNumber,
    invoiceType:result.invoiceType,mappingVersion:result.mappingVersion,paymentType:result.paymentType
  });
  return result;
}

async function prepareCustomerFiscalDocument(input:PrepareInput):Promise<PreparedResult>{
  if(!productionDatabaseConfigured())throw new Error("Fiscal document preparation requires PostgreSQL");
  const documentId=input.documentId.trim();const eventCode=input.eventCode.trim();const processor=input.processor.trim().toUpperCase();const processorMethod=input.processorMethod.trim().toUpperCase();
  if(!documentId||!eventCode||!processor||!processorMethod)throw new Error("Document, mapping and payment method are required");
  const db=getProductionPostgresRuntime().nativePool;const client=await db.connect();const now=Date.now();const issueDate=athensDate(now);
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bls_mydata_fiscal_prepare'))");
    const document=await client.query<{
      document_uuid:string;public_id:string;type:string;status:string;transmission_status:string;mapping_version:string|null;document_number:string|null;
      market_id:string;order_uuid:string;order_public_id:string;currency:string;net_minor:string|number;tax_minor:string|number;gross_minor:string|number;
      payload_snapshot:Record<string,unknown>;shipping_minor:string|number;discount_minor:string|number;confirmed_at:Date|null;
      payment_provider:string|null;provider_transaction_id:string|null;
    }>(`SELECT td.id::text AS document_uuid,td.public_id,td.type,td.status,td.transmission_status,td.mapping_version,td.document_number,
          td.market_id::text,td.order_id::text AS order_uuid,o.public_id AS order_public_id,td.currency,td.net_minor,td.tax_minor,td.gross_minor,
          td.payload_snapshot,o.shipping_minor,o.discount_minor,o.confirmed_at,p.provider AS payment_provider,p.provider_transaction_id
        FROM tax_documents td
        JOIN customer_orders o ON o.id=td.order_id
        LEFT JOIN LATERAL (SELECT p.provider,p.provider_transaction_id FROM payments p WHERE p.order_id=o.id AND p.status IN ('captured','partially_refunded','refunded') ORDER BY p.updated_at DESC LIMIT 1) p ON true
        WHERE td.public_id=$1 FOR UPDATE OF td,o`,[documentId]);
    if(!document.rowCount)throw new Error("Tax document not found");
    const d=document.rows[0]!;
    if(d.transmission_status==="accepted"||d.document_number){
      if(d.transmission_status==="ready"||d.transmission_status==="accepted"){
        await client.query("COMMIT");
        return existingPreparedResult(d);
      }
      throw new Error(`Tax document is already numbered and is ${d.transmission_status}; use reconciliation instead of preparing it again`);
    }
    if(d.type!=="pending_customer_sale")throw new Error("Only pending customer-sale fiscal records can be prepared here");
    if(!["not_ready","manual_review"].includes(d.transmission_status))throw new Error(`Tax document is ${d.transmission_status}, not preparable`);
    if(integer(d.shipping_minor)!==0)throw new Error("Shipping/handling is non-zero. Configure and approve its VAT/revenue treatment before fiscal preparation; no tax treatment will be guessed");
    const actualPaymentProvider=d.payment_provider?.trim().toUpperCase();
    if(processor==="VIVA"&&actualPaymentProvider!=="VIVA")throw new Error("Viva payment mapping can be used only when the captured payment provider is Viva");
    if(actualPaymentProvider==="VIVA"&&processor!=="VIVA")throw new Error("A captured Viva payment cannot be prepared with an offline/non-Viva payment mapping");

    const policy=await client.query<{id:string;public_id:string;version:string;policy_hash:string|null;seller_tax_number:string;status:string;fiscalisation_route:string}>(
      `SELECT p.id::text,p.public_id,p.version,p.policy_hash,p.seller_tax_number,p.status,p.fiscalisation_route FROM accounting_tax_policies p WHERE p.market_id=$1::uuid AND p.status='approved' ORDER BY p.approved_at DESC LIMIT 1 FOR SHARE`,[d.market_id]);
    if(!policy.rowCount)throw new Error("No approved Accounting Policy exists for this market");const p=policy.rows[0]!;
    if(p.fiscalisation_route!=="aade_direct_erp")throw new Error("Built-in fiscal preparation currently supports only the approved AADE Direct ERP route; Viva Fiscal provider transmission is not implemented");

    const mapping=await client.query<{invoice_type:string;income_category:string|null;e3_code:string|null;series_code:string;customer_kind:string;item_kind:string;geography:string;direction:string;production_status:string}>(
      `SELECT d.invoice_type,d.income_category,d.e3_code,d.series_code,d.customer_kind,d.item_kind,d.geography,d.direction,d.production_status
       FROM mydata_document_mappings d WHERE d.policy_id=$1::uuid AND d.event_code=$2 LIMIT 1`,[p.id,eventCode]);
    if(!mapping.rowCount)throw new Error("Selected document mapping does not belong to the approved Accounting Policy");const m=mapping.rows[0]!;
    if(m.production_status!=="approved")throw new Error(`Document mapping ${eventCode} is not approved`);
    if(m.customer_kind!=="b2c"||m.geography!=="domestic"||m.direction!=="sale")throw new Error("Automatic preparation is currently limited to domestic B2C sales; B2B tax identity must be modeled before invoice preparation");
    if(!["11.1","11.2"].includes(m.invoice_type))throw new Error("This Admin preparation path currently supports retail receipt types 11.1 and 11.2 only");
    if(!m.income_category||!m.e3_code)throw new Error("Approved document mapping is missing income classification or E3 code");

    const payment=await client.query<{mydata_payment_type:number;requires_transaction_id:boolean;erp_requires_ecr_token:boolean;provider_signature_route:boolean;production_status:string}>(
      `SELECT mydata_payment_type,requires_transaction_id,erp_requires_ecr_token,provider_signature_route,production_status FROM mydata_payment_mappings
       WHERE policy_id=$1::uuid AND processor=$2 AND processor_method=$3 LIMIT 1`,[p.id,processor,processorMethod]);
    if(!payment.rowCount)throw new Error("Selected payment mapping does not belong to the approved Accounting Policy");const pm=payment.rows[0]!;
    if(pm.production_status!=="approved")throw new Error(`Payment mapping ${processor}/${processorMethod} is not approved`);
    const paymentType=integer(pm.mydata_payment_type);const transactionId=d.provider_transaction_id?.trim()||undefined;const paymentTid=input.paymentTid?.trim()||undefined;
    if(pm.requires_transaction_id&&!transactionId)throw new Error("Selected payment mapping requires a verified payment transactionId");
    if(pm.provider_signature_route)throw new Error("Provider-signature payment mapping cannot be prepared through the built-in AADE Direct ERP route");
    let ecrToken:Record<string,string>|undefined;
    if(paymentType===7||pm.erp_requires_ecr_token){
      const signingAuthor=input.ecrSigningAuthor?.trim();const signature=input.ecrSignature?.trim();
      if(!transactionId)throw new Error("POS/e-POS payment type 7 requires the verified payment transactionId");
      if(!signingAuthor||!signature)throw new Error("AADE Direct ERP type-7 payment requires a real ECRToken SigningAuthor and Signature");
      if(signingAuthor.length>20)throw new Error("ECRToken SigningAuthor exceeds AADE maximum length 20");
      ecrToken={SigningAuthor:signingAuthor,Signature:signature};
    }

    const series=await client.query<{id:string;series:string;invoice_type:string;fiscal_year:number;next_aa:string|number;locked:boolean}>(
      `SELECT s.id::text,s.series,s.invoice_type,s.fiscal_year,s.next_aa,s.locked FROM mydata_fiscal_series s WHERE s.market_id=$1::uuid AND s.series=$2 FOR UPDATE`,[d.market_id,m.series_code]);
    if(!series.rowCount)throw new Error(`Fiscal series ${m.series_code} is not configured`);const s=series.rows[0]!;
    if(s.locked)throw new Error(`Fiscal series ${s.series} is locked`);if(integer(s.fiscal_year)!==Number(issueDate.slice(0,4)))throw new Error(`Fiscal series ${s.series} belongs to ${s.fiscal_year}, not ${issueDate.slice(0,4)}`);
    if(s.invoice_type!==m.invoice_type&&!s.invoice_type.split("/").includes(m.invoice_type))throw new Error(`Fiscal series ${s.series} is not configured for invoice type ${m.invoice_type}`);

    const lines=await client.query<{
      line_id:string;canonical_variant_id:string;assigned_offer_id:string;quantity:number;retail_unit_price_minor:string|number;captured_tax_rate_bps:number;line_tax_minor:string|number;discount_allocation_minor:string|number;product_snapshot:Record<string,unknown>;
      profile_id:string|null;vat_category:number|null;vat_rate_bps:number|null;vat_exemption_category:number|null;approval_version:string|null;profile_hash:string|null;
    }>(`SELECT ol.public_id AS line_id,ol.canonical_variant_id::text,ol.assigned_offer_id::text,ol.quantity,ol.retail_unit_price_minor,ol.tax_rate_bps AS captured_tax_rate_bps,ol.tax_minor AS line_tax_minor,ol.discount_allocation_minor,ol.product_snapshot,
          pt.public_id AS profile_id,pt.vat_category,pt.vat_rate_bps,pt.vat_exemption_category,pt.approval_version,pt.profile_hash
       FROM order_lines ol
       LEFT JOIN LATERAL (
         SELECT x.* FROM product_tax_profiles x
         WHERE x.market_id=$2::uuid AND x.accountant_approved=true AND x.approval_version=$3
           AND x.effective_from <= $4::date AND (x.effective_until IS NULL OR x.effective_until >= $4::date)
           AND (x.vendor_offer_id=ol.assigned_offer_id OR x.canonical_variant_id=ol.canonical_variant_id)
         ORDER BY CASE WHEN x.vendor_offer_id=ol.assigned_offer_id THEN 0 ELSE 1 END,x.effective_from DESC,x.created_at DESC LIMIT 1
       ) pt ON true
       WHERE ol.order_id=$1::uuid ORDER BY ol.created_at,ol.id`,[d.order_uuid,d.market_id,p.version,issueDate]);
    if(!lines.rowCount)throw new Error("Order has no lines");

    const preparedLines=lines.rows.map((line,index)=>{
      if(!line.profile_id||line.vat_category==null||line.vat_rate_bps==null||!line.approval_version||!line.profile_hash)throw new Error(`Order line ${line.line_id} lacks an approved effective product VAT profile for Accounting Policy ${p.version}`);
      if(line.approval_version!==p.version)throw new Error(`Order line ${line.line_id} VAT profile was approved under mapping ${line.approval_version}, not ${p.version}`);
      if(integer(line.captured_tax_rate_bps)!==integer(line.vat_rate_bps))throw new Error(`Order line ${line.line_id} captured VAT rate does not match its approved VAT profile`);
      const gross=integer(line.retail_unit_price_minor)*integer(line.quantity)-integer(line.discount_allocation_minor);const vat=integer(line.line_tax_minor);const net=gross-vat;
      if(gross<0||vat<0||net<0||vat>gross)throw new Error(`Order line ${line.line_id} has invalid fiscal totals`);
      if(integer(line.vat_category)===7&&line.vat_exemption_category==null)throw new Error(`Order line ${line.line_id} VAT category 7 requires an exemption category`);
      return{lineNumber:index+1,lineId:line.line_id,quantity:integer(line.quantity),netMinor:net,vatMinor:vat,grossMinor:gross,vatCategory:integer(line.vat_category),vatRateBps:integer(line.vat_rate_bps),vatExemptionCategory:line.vat_exemption_category==null?undefined:integer(line.vat_exemption_category),profileId:line.profile_id,profileHash:line.profile_hash,title:productTitle(line.product_snapshot)};
    });
    const summedNet=sum(preparedLines.map(x=>x.netMinor)),summedVat=sum(preparedLines.map(x=>x.vatMinor)),summedGross=sum(preparedLines.map(x=>x.grossMinor));
    if(summedNet!==integer(d.net_minor)||summedVat!==integer(d.tax_minor)||summedGross!==integer(d.gross_minor))throw new Error(`Order-line fiscal totals (${summedNet}/${summedVat}/${summedGross}) do not match captured document totals (${d.net_minor}/${d.tax_minor}/${d.gross_minor})`);

    const aa=String(integer(s.next_aa));const documentNumber=`${s.series}-${aa}`;
    const xml=buildMyDataXml({sellerTaxNumber:p.seller_tax_number,series:s.series,aa,issueDate,invoiceType:m.invoice_type,currency:d.currency.trim(),paymentType,grossMinor:summedGross,transactionId,paymentTid,ecrToken,lines:preparedLines,incomeCategory:m.income_category,e3Code:m.e3_code,totalNetMinor:summedNet,totalVatMinor:summedVat});
    const currentPayload=record(d.payload_snapshot);const preparedPayload={...currentPayload,lifecycle:"prepared_for_aade",preparedAt:new Date(now).toISOString(),preparation:{eventCode,accountingPolicyPublicId:p.public_id,policyVersion:p.version,policyHash:p.policy_hash,invoiceType:m.invoice_type,series:s.series,aa,issueDate,payment:{processor,processorMethod,mydataPaymentType:paymentType,transactionId:transactionId??null,tid:paymentTid??null,ecrTokenAttached:Boolean(ecrToken)},lines:preparedLines.map(x=>({lineId:x.lineId,profileId:x.profileId,profileHash:x.profileHash,vatCategory:x.vatCategory,vatRateBps:x.vatRateBps,vatExemptionCategory:x.vatExemptionCategory??null,netMinor:x.netMinor,vatMinor:x.vatMinor,grossMinor:x.grossMinor}))},mydataXml:xml};
    const updated=await client.query(`UPDATE tax_documents SET type='retail_receipt',document_number=$2,mapping_version=$3,invoice_type_code=$4,document_series=$5,document_aa=$6,issue_date=$7::date,accounting_policy_id=$8::uuid,fiscalisation_route='aade_direct_erp',payment_processor=$9,payment_processor_method=$10,mydata_payment_type=$11,payment_transaction_id=$12,payment_tid=$13,provider_payment_signature=NULL,ecr_token=$14::jsonb,payload_snapshot=$15::jsonb,transmission_status='ready',last_error=NULL WHERE id=$1::uuid AND type='pending_customer_sale' AND document_number IS NULL`,[d.document_uuid,documentNumber,p.version,m.invoice_type,s.series,aa,issueDate,p.id,processor,processorMethod,paymentType,transactionId??null,paymentTid??null,ecrToken?JSON.stringify(ecrToken):null,JSON.stringify(preparedPayload)]);
    if(!updated.rowCount)throw new Error("Fiscal document changed while it was being prepared");
    await client.query(`UPDATE mydata_fiscal_series SET next_aa=next_aa+1,updated_at=now() WHERE id=$1::uuid`,[s.id]);
    await client.query("COMMIT");
    return{ok:true,documentId:d.public_id,documentNumber,invoiceType:m.invoice_type,series:s.series,aa,issueDate,mappingVersion:p.version,paymentType};
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}

function buildMyDataXml(input:{sellerTaxNumber:string;series:string;aa:string;issueDate:string;invoiceType:string;currency:string;paymentType:number;grossMinor:number;transactionId?:string;paymentTid?:string;ecrToken?:Record<string,string>;lines:readonly {lineNumber:number;quantity:number;netMinor:number;vatMinor:number;vatCategory:number;vatExemptionCategory?:number}[];incomeCategory:string;e3Code:string;totalNetMinor:number;totalVatMinor:number}):string{
  const lineXml=input.lines.map(line=>`<invoiceDetails><lineNumber>${line.lineNumber}</lineNumber><quantity>${decimalQuantity(line.quantity)}</quantity><measurementUnit>1</measurementUnit><netValue>${money(line.netMinor)}</netValue><vatCategory>${line.vatCategory}</vatCategory><vatAmount>${money(line.vatMinor)}</vatAmount>${line.vatExemptionCategory===undefined?"":`<vatExemptionCategory>${line.vatExemptionCategory}</vatExemptionCategory>`}<incomeClassification><icls:classificationType>${escapeXml(input.e3Code)}</icls:classificationType><icls:classificationCategory>${escapeXml(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(line.netMinor)}</icls:amount></incomeClassification></invoiceDetails>`).join("");
  const paymentEvidence=[input.transactionId?`<transactionId>${escapeXml(input.transactionId)}</transactionId>`:"",input.paymentTid?`<tid>${escapeXml(input.paymentTid)}</tid>`:"",input.ecrToken?`<ECRToken><SigningAuthor>${escapeXml(input.ecrToken.SigningAuthor??"")}</SigningAuthor><Signature>${escapeXml(input.ecrToken.Signature??"")}</Signature></ECRToken>`:""].join("");
  return `<?xml version="1.0" encoding="UTF-8"?><InvoicesDoc xmlns="${INVOICE_NS}" xmlns:icls="${INCOME_NS}"><invoice><issuer><vatNumber>${escapeXml(input.sellerTaxNumber)}</vatNumber><country>GR</country><branch>0</branch></issuer><paymentMethods><paymentMethodDetails><type>${input.paymentType}</type><amount>${money(input.grossMinor)}</amount>${paymentEvidence}</paymentMethodDetails></paymentMethods><invoiceHeader><series>${escapeXml(input.series)}</series><aa>${escapeXml(input.aa)}</aa><issueDate>${input.issueDate}</issueDate><invoiceType>${escapeXml(input.invoiceType)}</invoiceType><currency>${escapeXml(input.currency)}</currency></invoiceHeader>${lineXml}<invoiceSummary><totalNetValue>${money(input.totalNetMinor)}</totalNetValue><totalVatAmount>${money(input.totalVatMinor)}</totalVatAmount><totalWithheldAmount>0.00</totalWithheldAmount><totalFeesAmount>0.00</totalFeesAmount><totalStampDutyAmount>0.00</totalStampDutyAmount><totalOtherTaxesAmount>0.00</totalOtherTaxesAmount><totalDeductionsAmount>0.00</totalDeductionsAmount><totalGrossValue>${money(input.grossMinor)}</totalGrossValue><incomeClassification><icls:classificationType>${escapeXml(input.e3Code)}</icls:classificationType><icls:classificationCategory>${escapeXml(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(input.totalNetMinor)}</icls:amount></incomeClassification></invoiceSummary></invoice></InvoicesDoc>`;
}
function existingPreparedResult(d:{public_id:string;document_number:string|null;mapping_version:string|null;payload_snapshot:Record<string,unknown>}):PreparedResult{const payload=record(d.payload_snapshot);const prep=record(payload.preparation);const invoiceType=stringValue(prep.invoiceType);const series=stringValue(prep.series);const aa=stringValue(prep.aa);const payment=record(prep.payment);const paymentType=integer(payment.mydataPaymentType);const issueDate=stringValue(prep.issueDate)||(typeof payload.preparedAt==="string"?athensDate(new Date(payload.preparedAt).getTime()):"");if(!d.document_number||!d.mapping_version||!invoiceType||!series||!aa||!issueDate)throw new Error("Existing prepared fiscal document is missing preparation metadata");return{ok:true,documentId:d.public_id,documentNumber:d.document_number,invoiceType,series,aa,issueDate,mappingVersion:d.mapping_version,paymentType};}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}function stringValue(value:unknown):string{return typeof value==="string"?value:"";}
function productTitle(snapshot:Record<string,unknown>):string|undefined{for(const key of ["title","name","item_name"]){const value=snapshot?.[key];if(typeof value==="string"&&value.trim())return value.trim();}return undefined;}
function integer(value:unknown):number{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error("Expected safe integer minor-unit value");return n;}function sum(values:readonly number[]):number{return values.reduce((a,b)=>a+b,0);}function money(minor:number):string{return (minor/100).toFixed(2);}function decimalQuantity(quantity:number):string{return quantity.toFixed(3).replace(/\.0+$/,"").replace(/(\.\d*?)0+$/,"$1");}
function escapeXml(value:string):string{return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
function athensDate(now:number):string{const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now));const m=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;}

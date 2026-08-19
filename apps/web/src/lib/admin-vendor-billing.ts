import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { resendConfigFromEnv, resendDeliveryEnabled } from "@buy-local-sparta/resend-notifications";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { configuredMyDataService } from "./mydata-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { renderVendorPlatformInvoicePdf } from "./vendor-platform-invoice-pdf";

export type VendorBillingWorkspace = Readonly<{
  policy?: Readonly<{version:string;status:string;route:string;mappingStatus?:string;mappingInvoiceType?:string;series?:string}>;
  paymentMappings: readonly Readonly<{processor:string;method:string;paymentType:number;status:string}>[];
  vendors: readonly Readonly<{id:string;name:string;taxNumber?:string;email?:string;agreementId?:string;eligibleCommissionMinor:number;eligibleProcurements:number;listingFeeMinor:number;recurringFeeMinor:number;recurringFeePeriod?:string}>[];
  invoices: readonly Readonly<{id:string;vendorId:string;vendorName:string;periodStart:string;periodEnd:string;netMinor:number;taxMinor:number;grossMinor:number;offsetMinor:number;status:string;paymentStatus:string;emailStatus:string;taxDocumentId?:string;documentNumber?:string;transmissionStatus?:string;mark?:string;uid?:string;lastError?:string;createdAt:number;items:readonly Readonly<{kind:string;description:string;netMinor:number;taxMinor:number;grossMinor:number;offsetMinor:number}>[]}>[];
}>;

type DraftInput=Readonly<{vendorId:string;periodStart:string;periodEnd:string;includeListingFee?:boolean;recurringFeeOccurrences?:number;notes?:string;reason:string}>;
type PrepareInput=Readonly<{invoiceId:string;processor:string;processorMethod:string;reason:string}>;

export async function adminVendorBillingWorkspace(principal:SessionPrincipal):Promise<VendorBillingWorkspace>{
  assertAdminPermission(principal,"finance.read");
  if(!productionDatabaseConfigured())throw new Error("Vendor billing requires PostgreSQL");
  const db=getProductionPostgresRuntime().nativePool;
  const [policyResult,vendorResult,invoiceResult,itemResult]=await Promise.all([
    db.query(`SELECT p.id::text,p.version,p.status,p.fiscalisation_route,d.production_status AS mapping_status,d.invoice_type,d.series_code
      FROM accounting_tax_policies p JOIN markets m ON m.id=p.market_id
      LEFT JOIN mydata_document_mappings d ON d.policy_id=p.id AND d.event_code='platform_vendor_service'
      WHERE m.code='sparta' ORDER BY CASE WHEN p.status='approved' THEN 0 ELSE 1 END,p.created_at DESC LIMIT 1`),
    db.query(`SELECT v.public_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS name,v.tax_number,
        COALESCE(va.contact_email::text,vl.public_email::text) AS email,a.public_id AS agreement_public_id,
        COALESCE(a.listing_fee_minor,0) AS listing_fee_minor,COALESCE(a.recurring_fee_minor,0) AS recurring_fee_minor,a.recurring_fee_period,
        COALESCE(sum(CASE WHEN p.id IS NOT NULL AND i.id IS NULL THEN p.service_fee_minor ELSE 0 END),0) AS eligible_commission_minor,
        count(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL AND i.id IS NULL) AS eligible_procurements
      FROM vendor_businesses v
      JOIN markets m ON m.id=v.market_id AND m.code='sparta'
      LEFT JOIN LATERAL (SELECT x.* FROM vendor_commercial_agreements x WHERE x.vendor_id=v.id AND x.status='active' ORDER BY x.starts_at DESC,x.created_at DESC LIMIT 1) a ON true
      LEFT JOIN LATERAL (SELECT contact_email FROM vendor_applications x WHERE x.vendor_id=v.id ORDER BY x.updated_at DESC,x.created_at DESC LIMIT 1) va ON true
      LEFT JOIN LATERAL (SELECT public_email FROM vendor_locations x WHERE x.vendor_id=v.id ORDER BY x.is_primary DESC,x.created_at LIMIT 1) vl ON true
      LEFT JOIN procurements p ON p.vendor_id=v.id AND p.status IN ('approved','payable','settled') AND p.service_fee_minor>0
      LEFT JOIN platform_vendor_invoice_items i ON i.source_kind='commission' AND i.source_public_id=p.public_id
      GROUP BY v.id,v.public_id,v.trading_name,v.legal_name,v.tax_number,va.contact_email,vl.public_email,a.public_id,a.listing_fee_minor,a.recurring_fee_minor,a.recurring_fee_period
      ORDER BY lower(COALESCE(NULLIF(v.trading_name,''),v.legal_name))`),
    db.query(`SELECT i.public_id,v.public_id AS vendor_public_id,COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
        i.billing_period_start,i.billing_period_end,i.net_minor,i.tax_minor,i.gross_minor,i.settlement_offset_minor,i.status,i.payment_status,i.vendor_email_status,i.created_at,
        td.public_id AS tax_document_public_id,td.document_number,td.transmission_status,td.aade_mark,td.aade_uid,td.last_error
      FROM platform_vendor_invoices i JOIN vendor_businesses v ON v.id=i.vendor_id
      LEFT JOIN tax_documents td ON td.id=i.tax_document_id
      ORDER BY i.created_at DESC LIMIT 250`),
    db.query(`SELECT i.public_id AS invoice_public_id,x.source_kind,x.description,x.net_minor,x.tax_minor,x.gross_minor,x.settlement_offset_minor
      FROM platform_vendor_invoice_items x JOIN platform_vendor_invoices i ON i.id=x.invoice_id ORDER BY x.created_at,x.id`)
  ]);
  const policyRow=policyResult.rows[0];
  let paymentMappings:VendorBillingWorkspace["paymentMappings"]=[];
  if(policyRow){
    const payments=await db.query(`SELECT processor,processor_method,mydata_payment_type,production_status FROM mydata_payment_mappings WHERE policy_id=$1::uuid ORDER BY processor,processor_method`,[policyRow.id]);
    paymentMappings=payments.rows.map(r=>({processor:String(r.processor),method:String(r.processor_method),paymentType:int(r.mydata_payment_type),status:String(r.production_status)}));
  }
  const itemsByInvoice=new Map<string,Array<{kind:string;description:string;netMinor:number;taxMinor:number;grossMinor:number;offsetMinor:number}>>();
  for(const row of itemResult.rows){const key=String(row.invoice_public_id);const list=itemsByInvoice.get(key)??[];list.push({kind:String(row.source_kind),description:String(row.description),netMinor:int(row.net_minor),taxMinor:int(row.tax_minor),grossMinor:int(row.gross_minor),offsetMinor:int(row.settlement_offset_minor)});itemsByInvoice.set(key,list);}
  return{
    policy:policyRow?{version:String(policyRow.version),status:String(policyRow.status),route:String(policyRow.fiscalisation_route),mappingStatus:opt(policyRow.mapping_status),mappingInvoiceType:opt(policyRow.invoice_type),series:opt(policyRow.series_code)}:undefined,
    paymentMappings,
    vendors:vendorResult.rows.map(r=>({id:String(r.public_id),name:String(r.name),taxNumber:opt(r.tax_number),email:opt(r.email),agreementId:opt(r.agreement_public_id),eligibleCommissionMinor:int(r.eligible_commission_minor),eligibleProcurements:int(r.eligible_procurements),listingFeeMinor:int(r.listing_fee_minor),recurringFeeMinor:int(r.recurring_fee_minor),recurringFeePeriod:opt(r.recurring_fee_period)})),
    invoices:invoiceResult.rows.map(r=>({id:String(r.public_id),vendorId:String(r.vendor_public_id),vendorName:String(r.vendor_name),periodStart:date(r.billing_period_start),periodEnd:date(r.billing_period_end),netMinor:int(r.net_minor),taxMinor:int(r.tax_minor),grossMinor:int(r.gross_minor),offsetMinor:int(r.settlement_offset_minor),status:String(r.status),paymentStatus:String(r.payment_status),emailStatus:String(r.vendor_email_status),taxDocumentId:opt(r.tax_document_public_id),documentNumber:opt(r.document_number),transmissionStatus:opt(r.transmission_status),mark:opt(r.aade_mark),uid:opt(r.aade_uid),lastError:opt(r.last_error),createdAt:epoch(r.created_at),items:itemsByInvoice.get(String(r.public_id))??[]}))
  };
}

export async function adminCreateVendorInvoiceDraft(principal:SessionPrincipal,input:DraftInput){
  assertAdminPermission(principal,"finance.write");validateDate(input.periodStart,"periodStart");validateDate(input.periodEnd,"periodEnd");if(input.periodEnd<input.periodStart)throw new Error("Billing period end must be on or after start");
  const occurrences=input.recurringFeeOccurrences??0;if(!Number.isSafeInteger(occurrences)||occurrences<0||occurrences>24)throw new Error("Recurring fee occurrences must be between 0 and 24");
  const db=getProductionPostgresRuntime().nativePool;const client=await db.connect();
  try{
    await client.query("BEGIN");
    const vendor=await client.query(`SELECT v.id::text,v.market_id::text,v.public_id,v.legal_name,v.trading_name,v.tax_number,v.gemi_number,
        COALESCE(va.contact_email::text,vl.public_email::text) AS email,
        COALESCE(NULLIF(va.address_line1,''),NULLIF(vl.address_line1,'')) AS address_line1,vl.postcode,vl.locality,
        a.id::text AS agreement_id,a.public_id AS agreement_public_id,a.agreement_code,a.agreement_version,a.commission_rate_bps,a.commission_tax_mode,a.commission_tax_rate_bps,
        COALESCE(a.listing_fee_minor,0) AS listing_fee_minor,COALESCE(a.recurring_fee_minor,0) AS recurring_fee_minor,a.recurring_fee_period,a.fee_tax_mode,a.fee_tax_rate_bps
      FROM vendor_businesses v
      LEFT JOIN LATERAL (SELECT contact_email,address_line1 FROM vendor_applications x WHERE x.vendor_id=v.id ORDER BY x.updated_at DESC,x.created_at DESC LIMIT 1) va ON true
      LEFT JOIN LATERAL (SELECT public_email,address_line1,postcode,locality FROM vendor_locations x WHERE x.vendor_id=v.id ORDER BY x.is_primary DESC,x.created_at LIMIT 1) vl ON true
      LEFT JOIN LATERAL (SELECT x.* FROM vendor_commercial_agreements x WHERE x.vendor_id=v.id AND x.status='active' AND x.starts_at < ($3::date+1) AND (x.ends_at IS NULL OR x.ends_at >= $2::date) ORDER BY x.starts_at DESC,x.created_at DESC LIMIT 1) a ON true
      WHERE v.public_id=$1 FOR UPDATE OF v`,[input.vendorId,input.periodStart,input.periodEnd]);
    if(!vendor.rowCount)throw new Error("Vendor not found");const v=vendor.rows[0];if(!v.agreement_id)throw new Error("An active commercial agreement is required for the selected billing period");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`vendor-billing:${v.id}`]);
    const procurements=await client.query(`SELECT p.id::text,p.public_id,p.procurement_number,p.service_fee_net_minor,p.service_fee_tax_minor,p.service_fee_minor,p.currency,
          COALESCE(o.confirmed_at,p.updated_at) AS service_at,o.public_id AS order_public_id,
          c.agreement_id,c.agreement_public_id,c.tax_mode,c.tax_rate_bps,c.agreement_count
        FROM procurements p JOIN customer_orders o ON o.id=p.order_id
        LEFT JOIN LATERAL (
          SELECT min(ol.commission_agreement_id::text) AS agreement_id,min(ol.commission_agreement_public_id_snapshot) AS agreement_public_id,
            min(ol.commission_tax_mode) AS tax_mode,min(ol.commission_tax_rate_bps) AS tax_rate_bps,count(DISTINCT ol.commission_agreement_id) AS agreement_count
          FROM order_lines ol WHERE ol.order_id=p.order_id AND ol.vendor_id=p.vendor_id AND ol.commission_total_minor>0
        ) c ON true
        LEFT JOIN platform_vendor_invoice_items done ON done.source_kind='commission' AND done.source_public_id=p.public_id
        WHERE p.vendor_id=$1::uuid AND p.status IN ('approved','payable','settled') AND p.service_fee_minor>0 AND done.id IS NULL
          AND COALESCE(o.confirmed_at,p.updated_at)::date BETWEEN $2::date AND $3::date
        ORDER BY COALESCE(o.confirmed_at,p.updated_at),p.created_at FOR UPDATE OF p`,[v.id,input.periodStart,input.periodEnd]);
    const items:Array<{kind:"commission"|"listing_fee"|"recurring_fee";sourceId:string;procurementId?:string;agreementId?:string;serviceDate?:string;description:string;vatRateBps:number;net:number;tax:number;gross:number;offset:number;snapshot:Record<string,unknown>}>=[];
    for(const p of procurements.rows){
      if(int(p.agreement_count)!==1||!p.agreement_id)throw new Error(`Procurement ${p.public_id} does not have one immutable commission agreement snapshot`);
      const net=int(p.service_fee_net_minor),tax=int(p.service_fee_tax_minor),gross=int(p.service_fee_minor);if(net+tax!==gross)throw new Error(`Procurement ${p.public_id} has inconsistent commission totals`);
      items.push({kind:"commission",sourceId:String(p.public_id),procurementId:String(p.id),agreementId:String(p.agreement_id),serviceDate:date(p.service_at),description:`Προμήθεια marketplace · ${p.procurement_number} · order ${p.order_public_id}`,vatRateBps:String(p.tax_mode)==="none"?0:int(p.tax_rate_bps),net,tax,gross,offset:gross,snapshot:{procurementId:p.public_id,procurementNumber:p.procurement_number,orderId:p.order_public_id,agreementId:p.agreement_public_id,taxMode:p.tax_mode,taxRateBps:int(p.tax_rate_bps)}});
    }
    if(input.includeListingFee&&int(v.listing_fee_minor)>0){
      const amount=feeAmounts(int(v.listing_fee_minor),String(v.fee_tax_mode),int(v.fee_tax_rate_bps));
      items.push({kind:"listing_fee",sourceId:String(v.agreement_public_id),agreementId:String(v.agreement_id),serviceDate:input.periodEnd,description:`One-time / listing fee · ${v.agreement_code}`,vatRateBps:amount.rate,net:amount.net,tax:amount.tax,gross:amount.gross,offset:0,snapshot:{agreementId:v.agreement_public_id,agreementCode:v.agreement_code,agreementVersion:v.agreement_version,feeTaxMode:v.fee_tax_mode,feeTaxRateBps:v.fee_tax_rate_bps}});
    }
    for(let i=0;i<occurrences;i++){
      if(int(v.recurring_fee_minor)<=0)throw new Error("Recurring fee occurrences were requested but the agreement has no recurring fee");
      const amount=feeAmounts(int(v.recurring_fee_minor),String(v.fee_tax_mode),int(v.fee_tax_rate_bps));
      items.push({kind:"recurring_fee",sourceId:`${v.agreement_public_id}:${input.periodStart}:${input.periodEnd}:${i+1}`,agreementId:String(v.agreement_id),serviceDate:input.periodEnd,description:`Recurring platform fee ${i+1}/${occurrences} · ${v.agreement_code}`,vatRateBps:amount.rate,net:amount.net,tax:amount.tax,gross:amount.gross,offset:0,snapshot:{agreementId:v.agreement_public_id,agreementCode:v.agreement_code,occurrence:i+1,periodStart:input.periodStart,periodEnd:input.periodEnd,recurringFeePeriod:v.recurring_fee_period,feeTaxMode:v.fee_tax_mode,feeTaxRateBps:v.fee_tax_rate_bps}});
    }
    if(!items.length)throw new Error("No uninvoiced commissions or selected contractual fees exist for this billing period");
    const totals=items.reduce((a,x)=>({net:a.net+x.net,tax:a.tax+x.tax,gross:a.gross+x.gross,offset:a.offset+x.offset}),{net:0,tax:0,gross:0,offset:0});
    const actor=await resolveActor(client,principal.userId);const invoiceId=`pvinv_${randomUUID().replaceAll("-","")}`;
    const inserted=await client.query(`INSERT INTO platform_vendor_invoices(public_id,market_id,vendor_id,agreement_id,billing_period_start,billing_period_end,currency,net_minor,tax_minor,gross_minor,settlement_offset_minor,collection_method,payment_status,paid_minor,status,notes,created_by)
      VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5::date,$6::date,'EUR',$7,$8,$9,$10,$11,$12,$10,'draft',$13,$14::uuid) RETURNING id::text`,[invoiceId,v.market_id,v.id,v.agreement_id,input.periodStart,input.periodEnd,totals.net,totals.tax,totals.gross,totals.offset,totals.offset===totals.gross?"settlement_offset":totals.offset>0?"mixed":"external_payment",totals.offset===totals.gross?"offset":totals.offset>0?"partially_paid":"unpaid",input.notes?.trim()||null,actor]);
    const invoiceUuid=String(inserted.rows[0].id);
    for(const x of items)await client.query(`INSERT INTO platform_vendor_invoice_items(invoice_id,source_kind,source_public_id,procurement_id,agreement_id,service_date,service_period_start,service_period_end,description,vat_rate_bps,net_minor,tax_minor,gross_minor,settlement_offset_minor,source_snapshot)
      VALUES($1::uuid,$2,$3,$4::uuid,$5::uuid,$6::date,$7::date,$8::date,$9,$10,$11,$12,$13,$14,$15::jsonb)`,[invoiceUuid,x.kind,x.sourceId,x.procurementId??null,x.agreementId??null,x.serviceDate??null,x.kind==="recurring_fee"?input.periodStart:null,x.kind==="recurring_fee"?input.periodEnd:null,x.description,x.vatRateBps,x.net,x.tax,x.gross,x.offset,JSON.stringify(x.snapshot)]);
    await client.query("COMMIT");
    await recordAdminAudit(principal,"vendor_billing.draft_created","platform_vendor_invoice",invoiceId,input.reason,{vendorId:input.vendorId,periodStart:input.periodStart,periodEnd:input.periodEnd,items:items.length,...totals});
    return{ok:true,invoiceId};
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);if((error as {code?:string}).code==="23505")throw new Error("One or more commission/fee sources have already been invoiced");throw error;}finally{client.release();}
}

export async function adminPrepareVendorInvoice(principal:SessionPrincipal,input:PrepareInput){
  assertAdminPermission(principal,"finance.write");const processor=input.processor.trim().toUpperCase(),method=input.processorMethod.trim().toUpperCase();if(!processor||!method)throw new Error("Payment mapping is required");
  const db=getProductionPostgresRuntime().nativePool;const client=await db.connect();const issueDate=athensDate(Date.now());
  try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext('bls_vendor_fiscal_prepare'))");
    const invoice=await client.query(`SELECT i.id::text,i.public_id,i.market_id::text,i.vendor_id::text,i.agreement_id::text,i.status,i.net_minor,i.tax_minor,i.gross_minor,i.billing_period_start,i.billing_period_end,
        v.public_id AS vendor_public_id,v.legal_name,v.trading_name,v.tax_number,v.gemi_number,
        COALESCE(va.contact_email::text,vl.public_email::text) AS email,COALESCE(NULLIF(va.address_line1,''),NULLIF(vl.address_line1,'')) AS address_line1,vl.postcode,vl.locality
      FROM platform_vendor_invoices i JOIN vendor_businesses v ON v.id=i.vendor_id
      LEFT JOIN LATERAL (SELECT contact_email,address_line1 FROM vendor_applications x WHERE x.vendor_id=v.id ORDER BY x.updated_at DESC,x.created_at DESC LIMIT 1) va ON true
      LEFT JOIN LATERAL (SELECT public_email,address_line1,postcode,locality FROM vendor_locations x WHERE x.vendor_id=v.id ORDER BY x.is_primary DESC,x.created_at LIMIT 1) vl ON true
      WHERE i.public_id=$1 FOR UPDATE OF i`,[input.invoiceId]);
    if(!invoice.rowCount)throw new Error("Vendor invoice draft not found");const inv=invoice.rows[0];if(String(inv.status)!=="draft")throw new Error(`Vendor invoice is ${inv.status}, not draft`);
    const taxNumber=String(inv.tax_number??"").trim();if(!/^\d{9}$/.test(taxNumber))throw new Error("Vendor must have a valid 9-digit Greek AFM before invoice preparation");const address=String(inv.address_line1??"").trim();if(!address)throw new Error("Vendor registered/shop address is required before invoice preparation");
    const policy=await client.query(`SELECT p.id::text,p.public_id,p.version,p.policy_hash,p.seller_tax_number,p.status,p.fiscalisation_route,d.invoice_type,d.income_category,d.e3_code,d.series_code,d.production_status AS mapping_status
      FROM accounting_tax_policies p JOIN mydata_document_mappings d ON d.policy_id=p.id AND d.event_code='platform_vendor_service'
      WHERE p.market_id=$1::uuid AND p.status='approved' ORDER BY p.approved_at DESC LIMIT 1 FOR SHARE OF p,d`,[inv.market_id]);
    if(!policy.rowCount)throw new Error("No approved Accounting Policy with platform_vendor_service mapping exists");const p=policy.rows[0];if(String(p.mapping_status)!=="approved")throw new Error("platform_vendor_service mapping is not approved");if(String(p.fiscalisation_route)!=="aade_direct_erp")throw new Error("Built-in vendor invoice preparation currently supports the approved AADE Direct ERP route only");if(String(p.invoice_type)!=="2.1")throw new Error("Domestic vendor service billing must use the approved 2.1 service-invoice mapping");if(!p.income_category||!p.e3_code)throw new Error("Vendor service mapping is missing income classification/E3 code");
    const payment=await client.query(`SELECT mydata_payment_type,production_status,erp_requires_ecr_token,provider_signature_route FROM mydata_payment_mappings WHERE policy_id=$1::uuid AND processor=$2 AND processor_method=$3 LIMIT 1`,[p.id,processor,method]);
    if(!payment.rowCount||String(payment.rows[0].production_status)!=="approved")throw new Error("Selected vendor invoice payment mapping is not approved");const paymentType=int(payment.rows[0].mydata_payment_type);if(paymentType===7||payment.rows[0].erp_requires_ecr_token||payment.rows[0].provider_signature_route)throw new Error("Vendor commission/fee invoices cannot use POS/provider-signature payment mappings");
    const series=await client.query(`SELECT id::text,series,invoice_type,fiscal_year,next_aa,locked FROM mydata_fiscal_series WHERE market_id=$1::uuid AND series=$2 FOR UPDATE`,[inv.market_id,p.series_code]);if(!series.rowCount)throw new Error(`Fiscal series ${p.series_code} is not configured`);const s=series.rows[0];if(s.locked)throw new Error(`Fiscal series ${s.series} is locked`);if(int(s.fiscal_year)!==Number(issueDate.slice(0,4)))throw new Error(`Fiscal series ${s.series} is not for ${issueDate.slice(0,4)}`);
    const itemRows=await client.query(`SELECT source_kind,source_public_id,description,vat_rate_bps,net_minor,tax_minor,gross_minor,settlement_offset_minor,source_snapshot FROM platform_vendor_invoice_items WHERE invoice_id=$1::uuid ORDER BY created_at,id`,[inv.id]);if(!itemRows.rowCount)throw new Error("Vendor invoice has no billing items");
    const fiscalLines=[] as Array<{line:number;description:string;net:number;tax:number;gross:number;vatCategory:number;vatRateBps:number}>;
    let line=0;for(const item of itemRows.rows){line++;const net=int(item.net_minor),tax=int(item.tax_minor),gross=int(item.gross_minor),rate=int(item.vat_rate_bps);if(net+tax!==gross)throw new Error("Vendor billing item totals are inconsistent");if(net>0&&rate===0)throw new Error("VAT-exempt vendor service items require an explicit exemption category before AADE preparation");const vat=await client.query(`SELECT code FROM mydata_vat_category_catalog WHERE rate_bps=$1 AND special_category=false ORDER BY code`,[rate]);if(vat.rowCount!==1)throw new Error(`VAT rate ${rate/100}% does not resolve to exactly one approved myDATA VAT category`);fiscalLines.push({line,description:String(item.description),net,tax,gross,vatCategory:int(vat.rows[0].code),vatRateBps:rate});}
    const totals=fiscalLines.reduce((a,x)=>({net:a.net+x.net,tax:a.tax+x.tax,gross:a.gross+x.gross}),{net:0,tax:0,gross:0});if(totals.net!==int(inv.net_minor)||totals.tax!==int(inv.tax_minor)||totals.gross!==int(inv.gross_minor))throw new Error("Vendor invoice item totals do not match draft totals");
    const aa=String(int(s.next_aa)),documentNumber=`${s.series}-${aa}`;const counterparty={vendorId:inv.vendor_public_id,legalName:String(inv.legal_name),tradingName:String(inv.trading_name??""),taxNumber,address,postcode:opt(inv.postcode),locality:opt(inv.locality),gemiNumber:opt(inv.gemi_number),email:opt(inv.email)};
    const xml=buildVendorServiceXml({sellerTaxNumber:String(p.seller_tax_number),counterparty,series:String(s.series),aa,issueDate,invoiceType:String(p.invoice_type),paymentType,lines:fiscalLines,incomeCategory:String(p.income_category),e3Code:String(p.e3_code),totalNet:totals.net,totalTax:totals.tax,totalGross:totals.gross});
    const taxDocId=`tax_${randomUUID().replaceAll("-","")}`;const taxDoc=await client.query(`INSERT INTO tax_documents(public_id,market_id,vendor_id,type,document_number,provider,currency,net_minor,tax_minor,gross_minor,status,payload_snapshot,mapping_version,invoice_type_code,document_series,document_aa,issue_date,transmission_status,accounting_policy_id,fiscalisation_route,payment_processor,payment_processor_method,mydata_payment_type)
      VALUES($1,$2::uuid,$3::uuid,'platform_service_invoice',$4,'aade_mydata','EUR',$5,$6,$7,'pending',$8::jsonb,$9,$10,$11,$12,$13::date,'ready',$14::uuid,'aade_direct_erp',$15,$16,$17) RETURNING id::text`,[taxDocId,inv.market_id,inv.vendor_id,documentNumber,totals.net,totals.tax,totals.gross,JSON.stringify({lifecycle:"prepared_vendor_service_invoice",preparedAt:new Date().toISOString(),issueDate,vendorBillingInvoiceId:inv.public_id,accountingPolicyPublicId:p.public_id,policyVersion:p.version,policyHash:p.policy_hash,counterparty,billingPeriod:{start:date(inv.billing_period_start),end:date(inv.billing_period_end)},payment:{processor,method,mydataPaymentType:paymentType},items:fiscalLines,mydataXml:xml}),p.version,p.invoice_type,s.series,aa,issueDate,p.id,processor,method,paymentType]);
    await client.query(`UPDATE platform_vendor_invoices SET tax_document_id=$2::uuid,status='prepared',updated_at=now() WHERE id=$1::uuid`,[inv.id,taxDoc.rows[0].id]);await client.query(`UPDATE mydata_fiscal_series SET next_aa=next_aa+1,updated_at=now() WHERE id=$1::uuid`,[s.id]);await client.query("COMMIT");
    await recordAdminAudit(principal,"vendor_billing.prepared","platform_vendor_invoice",input.invoiceId,input.reason,{taxDocumentId:taxDocId,documentNumber,mappingVersion:p.version,paymentType});return{ok:true,invoiceId:input.invoiceId,taxDocumentId:taxDocId,documentNumber};
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}

export async function adminTransmitVendorInvoice(principal:SessionPrincipal,input:{invoiceId:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const db=getProductionPostgresRuntime().nativePool;const row=await db.query(`SELECT i.id::text,td.public_id AS tax_document_id FROM platform_vendor_invoices i JOIN tax_documents td ON td.id=i.tax_document_id WHERE i.public_id=$1 AND i.status='prepared'`,[input.invoiceId]);if(!row.rowCount)throw new Error("Prepared vendor invoice was not found");const service=await configuredMyDataService();if(!service)throw new Error("AADE myDATA service is not configured");const result=await service.transmitPreparedDocument(principal,{documentId:String(row.rows[0].tax_document_id)});const accepted=await db.query(`SELECT aade_mark FROM tax_documents WHERE public_id=$1 AND transmission_status='accepted'`,[row.rows[0].tax_document_id]);if(accepted.rowCount)await db.query(`UPDATE platform_vendor_invoices SET status='issued',updated_at=now() WHERE id=$1::uuid`,[row.rows[0].id]);await recordAdminAudit(principal,"vendor_billing.transmitted","platform_vendor_invoice",input.invoiceId,input.reason,{accepted:Boolean(accepted.rowCount),items:result.items.length});return result;
}

export async function adminVoidVendorInvoiceDraft(principal:SessionPrincipal,input:{invoiceId:string;reason:string}){
  assertAdminPermission(principal,"finance.write");const db=getProductionPostgresRuntime().nativePool;const result=await db.query(`UPDATE platform_vendor_invoices SET status='void',updated_at=now() WHERE public_id=$1 AND status='draft' RETURNING public_id`,[input.invoiceId]);if(!result.rowCount)throw new Error("Only draft vendor invoices can be voided here");await recordAdminAudit(principal,"vendor_billing.voided","platform_vendor_invoice",input.invoiceId,input.reason,{});return{ok:true};
}

export async function vendorPlatformInvoicePdf(invoiceId:string):Promise<{pdf:Buffer;filename:string}>{const data=await loadIssuedVendorInvoice(invoiceId);return{pdf:await renderVendorPlatformInvoicePdf(data),filename:`KONTA-MOY-${safe(data.documentNumber)}.pdf`};}

export async function adminEmailVendorInvoice(principal:SessionPrincipal,input:{invoiceId:string;reason:string}){
  assertAdminPermission(principal,"finance.write");if(!resendDeliveryEnabled(process.env)||!process.env.RESEND_API_KEY?.trim())throw new Error("Resend email delivery is not configured");const db=getProductionPostgresRuntime().nativePool;
  const claimed=await db.query(`UPDATE platform_vendor_invoices i SET vendor_email_status='sending',vendor_email_error=NULL,updated_at=now() FROM tax_documents td WHERE i.tax_document_id=td.id AND i.public_id=$1 AND i.status='issued' AND td.transmission_status='accepted' AND td.aade_mark IS NOT NULL AND i.vendor_email_status IN ('not_sent','failed') RETURNING i.public_id`,[input.invoiceId]);if(!claimed.rowCount)throw new Error("Issued vendor invoice is not eligible for email or was already sent");
  try{const data=await loadIssuedVendorInvoice(input.invoiceId);if(!data.vendorEmail)throw new Error("Vendor billing email is missing");const pdf=await renderVendorPlatformInvoicePdf(data);const config=resendConfigFromEnv(process.env);const response=await fetch(`${config.baseUrl.replace(/\/$/,"")}/emails`,{method:"POST",headers:{authorization:`Bearer ${config.apiKey}`,"content-type":"application/json","idempotency-key":`vendor-invoice:${input.invoiceId}:${data.mark}`},body:JSON.stringify({from:config.from,to:[data.vendorEmail],subject:`Τιμολόγιο ${data.documentNumber} · KONTA MOY`,text:`Επισυνάπτεται το τιμολόγιο ${data.documentNumber} για προμήθειες/υπηρεσίες KONTA MOY, συνολικής αξίας ${(data.grossMinor/100).toFixed(2)} EUR, με MARK ${data.mark}. Το ποσό που αναγράφεται ως συμψηφισμένο έχει ήδη αφαιρεθεί μέσω της αντίστοιχης εκκαθάρισης και δεν χρεώνεται δεύτερη φορά.`,...(config.replyTo?{reply_to:config.replyTo}:{}),attachments:[{filename:`KONTA-MOY-${safe(data.documentNumber)}.pdf`,content:pdf.toString("base64")}]} )});const body=await response.json().catch(()=>({})) as {id?:unknown};if(!response.ok||typeof body.id!=="string")throw new Error(`Resend send failed (${response.status})`);await db.query(`UPDATE platform_vendor_invoices SET vendor_email_status='sent',vendor_email_provider_id=$2,vendor_emailed_at=clock_timestamp(),vendor_email_error=NULL,updated_at=now() WHERE public_id=$1`,[input.invoiceId,body.id]);await recordAdminAudit(principal,"vendor_billing.emailed","platform_vendor_invoice",input.invoiceId,input.reason,{providerId:body.id});return{sent:true};}catch(error){await db.query(`UPDATE platform_vendor_invoices SET vendor_email_status='failed',vendor_email_error=$2,updated_at=now() WHERE public_id=$1`,[input.invoiceId,(error instanceof Error?error.message:String(error)).slice(0,500)]);throw error;}
}

export type VendorPlatformInvoicePdfData=Readonly<{documentNumber:string;issueDate:string;mark:string;uid?:string;qrUrl?:string;vendorName:string;vendorTaxNumber:string;vendorAddress:string;vendorEmail?:string;periodStart:string;periodEnd:string;currency:string;netMinor:number;taxMinor:number;grossMinor:number;offsetMinor:number;items:readonly Readonly<{description:string;netMinor:number;taxMinor:number;grossMinor:number;vatRateBps:number}>[]}>;
async function loadIssuedVendorInvoice(invoiceId:string):Promise<VendorPlatformInvoicePdfData>{const db=getProductionPostgresRuntime().nativePool;const result=await db.query(`SELECT i.billing_period_start,i.billing_period_end,i.settlement_offset_minor,td.document_number,td.issue_date,td.aade_mark,td.aade_uid,td.aade_qr_url,td.currency,td.net_minor,td.tax_minor,td.gross_minor,td.payload_snapshot FROM platform_vendor_invoices i JOIN tax_documents td ON td.id=i.tax_document_id WHERE i.public_id=$1 AND i.status='issued' AND td.transmission_status='accepted' AND td.aade_mark IS NOT NULL`,[invoiceId]);if(!result.rowCount)throw new Error("Accepted vendor fiscal invoice not found");const r=result.rows[0],payload=obj(r.payload_snapshot),counterparty=obj(payload.counterparty);const items=await db.query(`SELECT description,net_minor,tax_minor,gross_minor,vat_rate_bps FROM platform_vendor_invoice_items x JOIN platform_vendor_invoices i ON i.id=x.invoice_id WHERE i.public_id=$1 ORDER BY x.created_at,x.id`,[invoiceId]);return{documentNumber:String(r.document_number),issueDate:date(r.issue_date),mark:String(r.aade_mark),uid:opt(r.aade_uid),qrUrl:opt(r.aade_qr_url),vendorName:String(counterparty.legalName??counterparty.tradingName??"Vendor"),vendorTaxNumber:String(counterparty.taxNumber??""),vendorAddress:String(counterparty.address??""),vendorEmail:opt(counterparty.email),periodStart:date(r.billing_period_start),periodEnd:date(r.billing_period_end),currency:String(r.currency).trim(),netMinor:int(r.net_minor),taxMinor:int(r.tax_minor),grossMinor:int(r.gross_minor),offsetMinor:int(r.settlement_offset_minor),items:items.rows.map(x=>({description:String(x.description),netMinor:int(x.net_minor),taxMinor:int(x.tax_minor),grossMinor:int(x.gross_minor),vatRateBps:int(x.vat_rate_bps)}))};}

function buildVendorServiceXml(input:{sellerTaxNumber:string;counterparty:{legalName:string;taxNumber:string};series:string;aa:string;issueDate:string;invoiceType:string;paymentType:number;lines:readonly {line:number;net:number;tax:number;vatCategory:number}[];incomeCategory:string;e3Code:string;totalNet:number;totalTax:number;totalGross:number}){const ns="http://www.aade.gr/myDATA/invoice/v1.0",icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0";const lines=input.lines.map(x=>`<invoiceDetails><lineNumber>${x.line}</lineNumber><netValue>${money(x.net)}</netValue><vatCategory>${x.vatCategory}</vatCategory><vatAmount>${money(x.tax)}</vatAmount><incomeClassification><icls:classificationType>${esc(input.e3Code)}</icls:classificationType><icls:classificationCategory>${esc(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(x.net)}</icls:amount></incomeClassification></invoiceDetails>`).join("");return `<?xml version="1.0" encoding="UTF-8"?><InvoicesDoc xmlns="${ns}" xmlns:icls="${icls}"><invoice><issuer><vatNumber>${esc(input.sellerTaxNumber)}</vatNumber><country>GR</country><branch>0</branch></issuer><counterpart><vatNumber>${esc(input.counterparty.taxNumber)}</vatNumber><country>GR</country><branch>0</branch><name>${esc(input.counterparty.legalName)}</name></counterpart><paymentMethods><paymentMethodDetails><type>${input.paymentType}</type><amount>${money(input.totalGross)}</amount></paymentMethodDetails></paymentMethods><invoiceHeader><series>${esc(input.series)}</series><aa>${esc(input.aa)}</aa><issueDate>${input.issueDate}</issueDate><invoiceType>${esc(input.invoiceType)}</invoiceType><currency>EUR</currency></invoiceHeader>${lines}<invoiceSummary><totalNetValue>${money(input.totalNet)}</totalNetValue><totalVatAmount>${money(input.totalTax)}</totalVatAmount><totalWithheldAmount>0.00</totalWithheldAmount><totalFeesAmount>0.00</totalFeesAmount><totalStampDutyAmount>0.00</totalStampDutyAmount><totalOtherTaxesAmount>0.00</totalOtherTaxesAmount><totalDeductionsAmount>0.00</totalDeductionsAmount><totalGrossValue>${money(input.totalGross)}</totalGrossValue><incomeClassification><icls:classificationType>${esc(input.e3Code)}</icls:classificationType><icls:classificationCategory>${esc(input.incomeCategory)}</icls:classificationCategory><icls:amount>${money(input.totalNet)}</icls:amount></incomeClassification></invoiceSummary></invoice></InvoicesDoc>`;}
function feeAmounts(base:number,mode:string,rate:number){if(mode==="plus_vat"){const tax=Math.round(base*rate/10000);return{net:base,tax,gross:base+tax,rate};}if(mode==="included"&&rate>0){const net=Math.round(base*10000/(10000+rate));return{net,tax:base-net,gross:base,rate};}return{net:base,tax:0,gross:base,rate:0};}
async function resolveActor(client:{query:(sql:string,params?:readonly unknown[])=>Promise<{rowCount:number|null;rows:any[]}>},userId:string){const r=await client.query(`SELECT id::text FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`,[userId]);return r.rowCount?String(r.rows[0].id):null;}
function validateDate(v:string,name:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error(`${name} must use YYYY-MM-DD`);}function int(v:unknown){const n=Number(v);if(!Number.isSafeInteger(n))throw new Error("Invalid integer database value");return n;}function opt(v:unknown){return typeof v==="string"&&v.trim()?v.trim():undefined;}function date(v:unknown){if(v instanceof Date)return v.toISOString().slice(0,10);const s=String(v);return s.slice(0,10);}function epoch(v:unknown){return v instanceof Date?v.getTime():new Date(String(v)).getTime();}function obj(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}function money(v:number){return(v/100).toFixed(2);}function esc(v:string){return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}function safe(v:string){return v.replace(/[^A-Za-z0-9._-]+/g,"-").slice(0,100)||"vendor-invoice";}function athensDate(now:number){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now));const m=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return`${m.year}-${m.month}-${m.day}`;}

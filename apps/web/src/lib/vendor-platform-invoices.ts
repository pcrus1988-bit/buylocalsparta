import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { vendorPlatformInvoicePdf } from "./admin-vendor-billing";

export type VendorPlatformInvoiceRow=Readonly<{id:string;documentNumber:string;issueDate:string;periodStart:string;periodEnd:string;netMinor:number;taxMinor:number;grossMinor:number;offsetMinor:number;mark:string;uid?:string;emailStatus:string}>;

export async function vendorPlatformInvoices(principal:SessionPrincipal):Promise<readonly VendorPlatformInvoiceRow[]>{
  if(!principal.vendorId||!productionDatabaseConfigured())return[];
  const result=await getProductionPostgresRuntime().nativePool.query(`SELECT i.public_id,td.document_number,td.issue_date,i.billing_period_start,i.billing_period_end,i.net_minor,i.tax_minor,i.gross_minor,i.settlement_offset_minor,td.aade_mark,td.aade_uid,i.vendor_email_status
    FROM platform_vendor_invoices i JOIN vendor_businesses v ON v.id=i.vendor_id JOIN tax_documents td ON td.id=i.tax_document_id
    WHERE v.public_id=$1 AND i.status='issued' AND td.transmission_status='accepted' AND td.aade_mark IS NOT NULL
    ORDER BY td.issue_date DESC,i.created_at DESC`,[principal.vendorId]);
  return result.rows.map(r=>({id:String(r.public_id),documentNumber:String(r.document_number),issueDate:date(r.issue_date),periodStart:date(r.billing_period_start),periodEnd:date(r.billing_period_end),netMinor:int(r.net_minor),taxMinor:int(r.tax_minor),grossMinor:int(r.gross_minor),offsetMinor:int(r.settlement_offset_minor),mark:String(r.aade_mark),uid:opt(r.aade_uid),emailStatus:String(r.vendor_email_status)}));
}

export async function vendorPlatformInvoicePdfForPrincipal(principal:SessionPrincipal,invoiceId:string){
  if(!principal.vendorId)throw new Error("Vendor session is required");
  const ownership=await getProductionPostgresRuntime().nativePool.query(`SELECT 1 FROM platform_vendor_invoices i JOIN vendor_businesses v ON v.id=i.vendor_id WHERE i.public_id=$1 AND v.public_id=$2 AND i.status='issued'`,[invoiceId,principal.vendorId]);
  if(!ownership.rowCount)throw new Error("Vendor invoice was not found");
  return vendorPlatformInvoicePdf(invoiceId);
}
function int(v:unknown){const n=Number(v);if(!Number.isSafeInteger(n))throw new Error("Invalid invoice amount");return n;}function opt(v:unknown){return typeof v==="string"&&v?v:undefined;}function date(v:unknown){if(v instanceof Date)return v.toISOString().slice(0,10);return String(v).slice(0,10);}

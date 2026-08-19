import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorFeeTaxSetting=Readonly<{vendorId:string;agreementId:string;feeTaxMode:"included"|"plus_vat"|"none";feeTaxRateBps:number}>;

export async function adminVendorFeeTaxSettings(principal:SessionPrincipal):Promise<readonly VendorFeeTaxSetting[]>{
  assertAdminPermission(principal,"finance.read");
  if(!productionDatabaseConfigured())return[];
  const result=await getProductionPostgresRuntime().nativePool.query(`SELECT v.public_id AS vendor_public_id,a.public_id AS agreement_public_id,a.fee_tax_mode,a.fee_tax_rate_bps
    FROM vendor_businesses v JOIN vendor_commercial_agreements a ON a.vendor_id=v.id
    JOIN markets m ON m.id=v.market_id AND m.code='sparta'
    WHERE a.status='active'
    ORDER BY a.starts_at DESC,a.created_at DESC`);
  const seen=new Set<string>(),rows:VendorFeeTaxSetting[]=[];
  for(const row of result.rows){const vendorId=String(row.vendor_public_id);if(seen.has(vendorId))continue;seen.add(vendorId);rows.push({vendorId,agreementId:String(row.agreement_public_id),feeTaxMode:mode(row.fee_tax_mode),feeTaxRateBps:integer(row.fee_tax_rate_bps)});}
  return rows;
}

export async function adminUpdateVendorFeeTaxSetting(principal:SessionPrincipal,input:{agreementId:string;feeTaxMode:"included"|"plus_vat"|"none";feeTaxRateBps:number;reason:string}){
  assertAdminPermission(principal,"finance.write");
  if(!productionDatabaseConfigured())throw new Error("Vendor fee tax configuration requires PostgreSQL");
  const feeTaxMode=mode(input.feeTaxMode);if(!Number.isSafeInteger(input.feeTaxRateBps)||input.feeTaxRateBps<0||input.feeTaxRateBps>10000)throw new Error("Fee VAT rate must be between 0% and 100%");if(feeTaxMode==="none"&&input.feeTaxRateBps!==0)throw new Error("Fee tax mode 'none' requires VAT rate 0%");
  const db=getProductionPostgresRuntime().nativePool;
  const result=await db.query(`UPDATE vendor_commercial_agreements SET fee_tax_mode=$2,fee_tax_rate_bps=$3,commercial_terms_snapshot=jsonb_set(jsonb_set(COALESCE(commercial_terms_snapshot,'{}'::jsonb),'{feeTaxMode}',to_jsonb($2::text),true),'{feeTaxRateBps}',to_jsonb($3::integer),true),updated_at=now() WHERE public_id=$1 AND status='active' RETURNING public_id,vendor_id::text`,[input.agreementId,feeTaxMode,input.feeTaxRateBps]);
  if(!result.rowCount)throw new Error("Active vendor agreement was not found");
  await recordAdminAudit(principal,"vendor_billing.fee_tax_updated","vendor_commercial_agreement",input.agreementId,input.reason,{feeTaxMode,feeTaxRateBps:input.feeTaxRateBps});
  return{ok:true};
}

export async function adminDeleteVendorInvoiceDraft(principal:SessionPrincipal,input:{invoiceId:string;reason:string}){
  assertAdminPermission(principal,"finance.write");
  if(!productionDatabaseConfigured())throw new Error("Vendor billing requires PostgreSQL");
  const db=getProductionPostgresRuntime().nativePool;
  const result=await db.query(`DELETE FROM platform_vendor_invoices WHERE public_id=$1 AND status='draft' RETURNING public_id,vendor_id::text,net_minor,tax_minor,gross_minor`,[input.invoiceId]);
  if(!result.rowCount)throw new Error("Only draft vendor invoices can be deleted/released");
  const row=result.rows[0];
  await recordAdminAudit(principal,"vendor_billing.draft_released","platform_vendor_invoice",input.invoiceId,input.reason,{vendorId:String(row.vendor_id),netMinor:integer(row.net_minor),taxMinor:integer(row.tax_minor),grossMinor:integer(row.gross_minor)});
  return{ok:true};
}

function mode(value:unknown):"included"|"plus_vat"|"none"{if(value==="included"||value==="plus_vat"||value==="none")return value;throw new Error("Invalid vendor fee VAT mode");}
function integer(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n))throw new Error("Invalid integer database value");return n;}

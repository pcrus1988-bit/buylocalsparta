import type { SessionPrincipal } from "@buy-local-sparta/core";
import { adminCreateVendorInvoiceDraft } from "./admin-vendor-billing";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export async function ensureCommissionInvoiceDraftForProcurement(principal: SessionPrincipal, procurementId: string) {
  if (!productionDatabaseConfigured()) return { ok: true, skipped: true as const };
  const db=getProductionPostgresRuntime().nativePool;
  const result=await db.query(`SELECT p.public_id,p.status::text AS status,p.service_fee_minor,v.public_id AS vendor_public_id,
      to_char((COALESCE(o.confirmed_at,p.updated_at) AT TIME ZONE 'Europe/Athens')::date,'YYYY-MM-DD') AS service_date,
      pvi.public_id AS existing_invoice_id,pvi.status AS existing_invoice_status
    FROM procurements p
    JOIN vendor_businesses v ON v.id=p.vendor_id
    JOIN customer_orders o ON o.id=p.order_id
    LEFT JOIN platform_vendor_invoice_items pvii ON pvii.source_kind='commission' AND pvii.source_public_id=p.public_id
    LEFT JOIN platform_vendor_invoices pvi ON pvi.id=pvii.invoice_id AND pvi.status <> 'void'
    WHERE p.public_id=$1 OR p.id::text=$1
    ORDER BY pvi.created_at DESC NULLS LAST LIMIT 1`,[procurementId]);
  if (!result.rowCount) throw new Error("Procurement not found after payable approval");
  const row=result.rows[0];
  if (Number(row.service_fee_minor??0)<=0) return {ok:true,skipped:true as const};
  if (row.existing_invoice_id) return {ok:true,invoiceId:String(row.existing_invoice_id),status:String(row.existing_invoice_status),existing:true as const};
  if (String(row.status)!=="payable") throw new Error("Commission invoice draft can only be automated after procurement becomes payable");
  const serviceDate=String(row.service_date);
  const draft=await adminCreateVendorInvoiceDraft(principal,{
    vendorId:String(row.vendor_public_id),periodStart:serviceDate,periodEnd:serviceDate,
    includeListingFee:false,recurringFeeOccurrences:0,
    notes:`Auto-created from payable procurement ${row.public_id}`,
    reason:`Automatic commission billing draft after payable approval for ${row.public_id}`
  });
  return {ok:true,invoiceId:draft.invoiceId,status:"draft",existing:false as const};
}

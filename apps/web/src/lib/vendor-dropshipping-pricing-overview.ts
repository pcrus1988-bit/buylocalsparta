import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";

async function resolveVendorUuid(vendorIdentity: string): Promise<string> {
  const vendor = await getProductionPostgresRuntime().nativePool.query(
    `SELECT id::text id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,
    [vendorIdentity]
  );
  if (!vendor.rowCount) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  return String(vendor.rows[0].id);
}

/**
 * Read-only overview of the existing NOVA/BrandsGateway automatic-pricing queue.
 * The worker owns pricing state; this helper only aggregates the persisted
 * pricingFlag so the vendor workspace can surface the backlog without creating
 * a second pricing or sync system.
 */
export async function vendorDropshippingPricingBacklogBySupplier(
  vendorIdentity: string
): Promise<ReadonlyMap<string, number>> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) return new Map<string, number>();

  const vendorId = await resolveVendorUuid(vendorIdentity);
  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT ds.code,
           count(dso.id) FILTER (
             WHERE dso.active
               AND dso.supplier_cost_minor IS NOT NULL
               AND coalesce(vo.source_payload->>'pricingFlag','')='PENDING'
           )::bigint pricing_pending_products
      FROM dropship_suppliers ds
      LEFT JOIN dropship_supplier_offers dso ON dso.supplier_id=ds.id
      LEFT JOIN vendor_offers vo
        ON vo.id=dso.vendor_offer_id
       AND vo.vendor_id=ds.owner_vendor_id
     WHERE ds.owner_vendor_id=$1::uuid
     GROUP BY ds.id, ds.code
     ORDER BY ds.code
  `, [vendorId]);

  return new Map(result.rows.map((row) => [String(row.code), Number(row.pricing_pending_products ?? 0)]));
}

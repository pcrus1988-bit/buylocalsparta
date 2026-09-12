import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";

export type DropshippingVisibilityActivity = Readonly<{
  id: string;
  createdAt: string;
  visible: boolean;
  title: string;
  supplierCode: string;
  supplierName: string;
}>;

export type DropshippingSupplierActivity = Readonly<{
  supplierCode: string;
  supplierName: string;
  lastCatalogueSyncAt: string | null;
  lastPricingUpdateAt: string | null;
  offerUpdates1h: number;
  offerUpdates24h: number;
  pricingUpdates1h: number;
  pricingUpdates24h: number;
}>;

export type DropshippingActivityWorkspace = Readonly<{
  visibilityEvents: readonly DropshippingVisibilityActivity[];
  manualVisibilityEvents7d: number;
  suppliers: readonly DropshippingSupplierActivity[];
}>;

function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

async function resolveVendorUuid(vendorIdentity: string): Promise<string> {
  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT id::text id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,
    [vendorIdentity]
  );
  if (result.rowCount !== 1) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  return String(result.rows[0].id);
}

export async function vendorDropshippingActivity(
  vendorIdentity: string,
  limit = 25
): Promise<DropshippingActivityWorkspace> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) return { visibilityEvents: [], manualVisibilityEvents7d: 0, suppliers: [] };

  const vendorId = await resolveVendorUuid(vendorIdentity);
  const pool = getProductionPostgresRuntime().nativePool;
  const safeLimit = Math.min(50, Math.max(5, Number.isSafeInteger(limit) ? limit : 25));

  const [events, eventCount, suppliers] = await Promise.all([
    pool.query(`
      SELECT e.public_id, e.created_at, e.visible,
             coalesce(pt_el.title,pt_en.title,cv.model,cv.public_id) title,
             ds.code supplier_code, ds.display_name supplier_name
        FROM vendor_catalog_visibility_events e
        JOIN vendor_offers vo ON vo.id=e.offer_id
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
          AND ds.owner_vendor_id=e.vendor_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
        LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
       WHERE e.vendor_id=$1::uuid
         AND e.scope='product'
         AND e.actor_id IS NOT NULL
         AND coalesce(e.metadata->>'source','')='vendor_dashboard'
       ORDER BY e.created_at DESC,e.id DESC
       LIMIT $2
    `, [vendorId, safeLimit]),
    pool.query(`
      SELECT count(*)::bigint events
        FROM vendor_catalog_visibility_events e
        JOIN vendor_offers vo ON vo.id=e.offer_id
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
          AND ds.owner_vendor_id=e.vendor_id
       WHERE e.vendor_id=$1::uuid
         AND e.scope='product'
         AND e.actor_id IS NOT NULL
         AND coalesce(e.metadata->>'source','')='vendor_dashboard'
         AND e.created_at >= now()-interval '7 days'
    `, [vendorId]),
    pool.query(`
      SELECT ds.code, ds.display_name,
             max(dso.last_catalogue_sync_at) last_catalogue_sync_at,
             count(*) FILTER (WHERE dso.updated_at >= now()-interval '1 hour')::bigint offer_updates_1h,
             count(*) FILTER (WHERE dso.updated_at >= now()-interval '24 hours')::bigint offer_updates_24h,
             max(pp.updated_at) last_pricing_update_at,
             count(pp.offer_id) FILTER (WHERE pp.updated_at >= now()-interval '1 hour')::bigint pricing_updates_1h,
             count(pp.offer_id) FILTER (WHERE pp.updated_at >= now()-interval '24 hours')::bigint pricing_updates_24h
        FROM dropship_suppliers ds
        LEFT JOIN dropship_supplier_offers dso ON dso.supplier_id=ds.id
        LEFT JOIN vendor_offer_pricing_private pp ON pp.offer_id=dso.vendor_offer_id AND pp.vendor_id=ds.owner_vendor_id
       WHERE ds.owner_vendor_id=$1::uuid
       GROUP BY ds.id,ds.code,ds.display_name
       ORDER BY ds.display_name,ds.code
    `, [vendorId])
  ]);

  return {
    visibilityEvents: events.rows.map((row) => ({
      id: String(row.public_id),
      createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
      visible: row.visible === true,
      title: String(row.title ?? "Προϊόν"),
      supplierCode: String(row.supplier_code),
      supplierName: String(row.supplier_name)
    })),
    manualVisibilityEvents7d: count(eventCount.rows[0]?.events),
    suppliers: suppliers.rows.map((row) => ({
      supplierCode: String(row.code),
      supplierName: String(row.display_name),
      lastCatalogueSyncAt: iso(row.last_catalogue_sync_at),
      lastPricingUpdateAt: iso(row.last_pricing_update_at),
      offerUpdates1h: count(row.offer_updates_1h),
      offerUpdates24h: count(row.offer_updates_24h),
      pricingUpdates1h: count(row.pricing_updates_1h),
      pricingUpdates24h: count(row.pricing_updates_24h)
    }))
  };
}

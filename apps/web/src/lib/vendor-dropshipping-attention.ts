import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";

export type DropshippingAttentionKind =
  | "published_unavailable"
  | "missing_cost"
  | "stale_availability"
  | "withdrawn"
  | "overpriced";

export type DropshippingAttentionCounts = Readonly<{
  publishedUnavailable: number;
  missingCost: number;
  staleAvailability: number;
  withdrawn: number;
  overpriced: number;
}>;

export type DropshippingAttentionItem = Readonly<{
  offerId: string;
  title: string;
  supplierCode: string;
  supplierName: string;
  kind: DropshippingAttentionKind;
  customerPriceMinor: number;
  msrpMinor: number | null;
  supplierCostMinor: number | null;
  availabilityCheckedAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
}>;

export type DropshippingAttentionWorkspace = Readonly<{
  counts: DropshippingAttentionCounts;
  items: readonly DropshippingAttentionItem[];
}>;

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function minor(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function attentionKind(value: unknown): DropshippingAttentionKind {
  return value === "published_unavailable"
    || value === "missing_cost"
    || value === "stale_availability"
    || value === "withdrawn"
    || value === "overpriced"
    ? value
    : "overpriced";
}

async function resolveVendorUuid(vendorIdentity: string): Promise<string> {
  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT id::text id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,
    [vendorIdentity]
  );
  if (result.rowCount !== 1) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  return String(result.rows[0].id);
}

/**
 * Vendor-facing review queue. It deliberately limits pricing/availability alerts
 * to active catalogue offers so historical supplier rows do not create false
 * operational alarms. Deleted-feed withdrawals are kept as a separate signal.
 */
export async function vendorDropshippingAttention(
  vendorIdentity: string,
  limit = 50
): Promise<DropshippingAttentionWorkspace> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) {
    return {
      counts: { publishedUnavailable: 0, missingCost: 0, staleAvailability: 0, withdrawn: 0, overpriced: 0 },
      items: []
    };
  }

  const vendorId = await resolveVendorUuid(vendorIdentity);
  const safeLimit = Math.min(100, Math.max(10, Number.isSafeInteger(limit) ? limit : 50));
  const pool = getProductionPostgresRuntime().nativePool;

  const [summary, queue] = await Promise.all([
    pool.query(`
      SELECT
        count(*) FILTER (
          WHERE vo.merchant_visible=true
            AND vo.status='approved'
            AND dso.active=true
            AND dso.cached_available=false
        )::bigint published_unavailable,
        count(*) FILTER (
          WHERE dso.active=true
            AND dso.supplier_cost_minor IS NULL
        )::bigint missing_cost,
        count(*) FILTER (
          WHERE dso.active=true
            AND (dso.availability_checked_at IS NULL OR dso.availability_checked_at < now()-interval '24 hours')
        )::bigint stale_availability,
        count(*) FILTER (
          WHERE dso.active=false
            AND coalesce(dso.availability_payload->>'withdrawnByDeletedFeed','false')='true'
        )::bigint withdrawn,
        count(*) FILTER (
          WHERE dso.active=true
            AND vo.status='approved'
            AND vo.source_payload->>'pricingFlag'='OVERPRICED'
        )::bigint overpriced
      FROM dropship_supplier_offers dso
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      WHERE ds.owner_vendor_id=$1::uuid
    `, [vendorId]),
    pool.query(`
      SELECT vo.public_id offer_id,
             coalesce(pt_el.title,pt_en.title,cv.model,cv.public_id) title,
             ds.code supplier_code,
             ds.display_name supplier_name,
             CASE
               WHEN vo.merchant_visible=true AND vo.status='approved' AND dso.active=true AND dso.cached_available=false
                 THEN 'published_unavailable'
               WHEN dso.active=true AND dso.supplier_cost_minor IS NULL
                 THEN 'missing_cost'
               WHEN dso.active=true AND (dso.availability_checked_at IS NULL OR dso.availability_checked_at < now()-interval '24 hours')
                 THEN 'stale_availability'
               WHEN dso.active=false AND coalesce(dso.availability_payload->>'withdrawnByDeletedFeed','false')='true'
                 THEN 'withdrawn'
               ELSE 'overpriced'
             END issue_kind,
             vo.customer_price_minor,
             vo.msrp_minor,
             dso.supplier_cost_minor,
             dso.availability_checked_at,
             greatest(vo.updated_at,dso.updated_at) updated_at,
             nullif(dso.availability_payload->>'deletedAt','') deleted_at,
             CASE
               WHEN vo.merchant_visible=true AND vo.status='approved' AND dso.active=true AND dso.cached_available=false THEN 1
               WHEN dso.active=true AND dso.supplier_cost_minor IS NULL THEN 2
               WHEN dso.active=true AND (dso.availability_checked_at IS NULL OR dso.availability_checked_at < now()-interval '24 hours') THEN 3
               WHEN dso.active=false AND coalesce(dso.availability_payload->>'withdrawnByDeletedFeed','false')='true' THEN 4
               ELSE 5
             END issue_priority
        FROM dropship_supplier_offers dso
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
        LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
       WHERE ds.owner_vendor_id=$1::uuid
         AND (
           (vo.merchant_visible=true AND vo.status='approved' AND dso.active=true AND dso.cached_available=false)
           OR (dso.active=true AND dso.supplier_cost_minor IS NULL)
           OR (dso.active=true AND (dso.availability_checked_at IS NULL OR dso.availability_checked_at < now()-interval '24 hours'))
           OR (dso.active=false AND coalesce(dso.availability_payload->>'withdrawnByDeletedFeed','false')='true')
           OR (dso.active=true AND vo.status='approved' AND vo.source_payload->>'pricingFlag'='OVERPRICED')
         )
       ORDER BY issue_priority, greatest(vo.updated_at,dso.updated_at) DESC, vo.public_id
       LIMIT $2
    `, [vendorId, safeLimit])
  ]);

  const row = summary.rows[0] ?? {};
  return {
    counts: {
      publishedUnavailable: count(row.published_unavailable),
      missingCost: count(row.missing_cost),
      staleAvailability: count(row.stale_availability),
      withdrawn: count(row.withdrawn),
      overpriced: count(row.overpriced)
    },
    items: queue.rows.map((item) => ({
      offerId: String(item.offer_id),
      title: String(item.title ?? "Προϊόν"),
      supplierCode: String(item.supplier_code),
      supplierName: String(item.supplier_name),
      kind: attentionKind(item.issue_kind),
      customerPriceMinor: minor(item.customer_price_minor) ?? 0,
      msrpMinor: minor(item.msrp_minor),
      supplierCostMinor: minor(item.supplier_cost_minor),
      availabilityCheckedAt: iso(item.availability_checked_at),
      updatedAt: iso(item.updated_at) ?? new Date(0).toISOString(),
      deletedAt: iso(item.deleted_at)
    }))
  };
}

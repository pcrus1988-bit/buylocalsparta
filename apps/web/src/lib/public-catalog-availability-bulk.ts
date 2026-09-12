import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type AvailabilityRow = Readonly<{ canonical_public_id: string }>;

/**
 * Lightweight bulk availability annotation for discovery surfaces.
 *
 * This deliberately does not run fairness assignment or create sticky state. It is
 * used for search suggestions where we only need a truthful "available now" hint
 * for a handful of candidate products. Checkout/product pages still resolve the
 * exact assigned offer through the normal commerce path.
 */
export async function loadPublicCatalogAvailability(
  canonicalVariantIds: readonly string[],
  now = Date.now()
): Promise<ReadonlySet<string>> {
  const ids = [...new Set(canonicalVariantIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length || !productionDatabaseConfigured()) return new Set();

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<AvailabilityRow>(`
      SELECT DISTINCT eligible.canonical_public_id
      FROM (
        SELECT cv.public_id AS canonical_public_id
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        WHERE cv.public_id=ANY($1::text[])
          AND m.code='sparta'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND v.status='active'
          AND l.active=true
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>$2

        UNION

        SELECT cv.public_id AS canonical_public_id
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        WHERE cv.public_id=ANY($1::text[])
          AND m.code='sparta'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND v.status='active'
          AND l.active=true
          AND dso.active=true
          AND ds.active=true
          AND ds.api_authoritative_availability=true
          AND dso.cached_available=true
          AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>$2
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      ) eligible
    `, [ids, new Date(now)]);

    return new Set(result.rows.map((row) => String(row.canonical_public_id)));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.search_availability_bulk_failed",
      canonicalCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Set();
  }
}

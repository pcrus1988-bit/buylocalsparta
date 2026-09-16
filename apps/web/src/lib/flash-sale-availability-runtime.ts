import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  novaAvailabilityRequestsPerMinute,
  runNovaAvailabilityRefreshForProduct
} from "./nova-availability-refresh-runtime";

const MARKET_CODE = "sparta";
const ATHENS_TIMEZONE = "Europe/Athens";
const NOVA_SUPPLIER_CODE = "nova_brandsgateway";
const MIN_PRICE_MINOR = 10_000;
const MAX_PRICE_MINOR = 50_000;
const FLASH_DISCOUNT_RATE = 0.20;
const RECENT_EXCLUSION_DAYS = 30;
const REQUIRED_FAMILIES = 10;
const MAX_TARGETED_REFRESH_PRODUCTS = 14;

type RefreshCandidate = Readonly<{
  external_product_id: string;
  owner_vendor_id: string;
}>;

/**
 * Flash Sale stays fail-closed on supplier freshness. The normal NOVA worker is the
 * primary availability source; this narrow recovery path exists only for the moment a
 * customer starts the daily game and only when the otherwise-eligible Flash pool has
 * fewer than ten fresh, unseen families.
 *
 * It never changes publication, price, taxonomy or catalogue identity. It refreshes
 * only already-approved Flash candidates through the same authoritative NOVA product
 * endpoint and database writer used by vendor recovery, respecting the configured
 * supplier request pace. The subsequent startFlashSale query remains the final gate.
 */
export async function ensureFreshFlashSalePool(customerPublicId: string): Promise<void> {
  if (await freshUnseenFamilyCount(customerPublicId) >= REQUIRED_FAMILIES) return;

  const candidates = await staleRefreshCandidates(customerPublicId);
  if (!candidates.length) return;

  const requestsPerMinute = novaAvailabilityRequestsPerMinute();
  const requestSpacingMs = Math.ceil(60_000 / requestsPerMinute);

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      await runNovaAvailabilityRefreshForProduct(candidate.external_product_id, candidate.owner_vendor_id);
    } catch {
      // Provider/network failures never make stale evidence fresh. Continue with the
      // remaining candidates; startFlashSale will still fail closed if the pool stays small.
    }

    if (await freshUnseenFamilyCount(customerPublicId) >= REQUIRED_FAMILIES) return;
    if (index < candidates.length - 1) await delay(requestSpacingMs);
  }
}

async function freshUnseenFamilyCount(customerPublicId: string): Promise<number> {
  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT count(DISTINCT COALESCE(cv.family_id::text, cv.id::text))::int AS family_count
    FROM canonical_variants cv
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN product_translations pt ON pt.canonical_variant_id=cv.id AND pt.locale='el'
    JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    JOIN dropship_suppliers ds ON ds.id=dso.supplier_id AND ds.code=$1
    JOIN users u ON u.public_id=$2
    JOIN markets m ON m.code=$3
    WHERE cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor BETWEEN $4 AND $5
      AND vo.msrp_minor > 0
      AND vo.customer_price_minor <= vo.msrp_minor * 0.40
      AND dso.active=true
      AND dso.cached_available=true
      AND dso.cached_quantity IS DISTINCT FROM 0
      AND dso.availability_expires_at > now()
      AND dso.supplier_cost_minor IS NOT NULL
      AND (vo.customer_price_minor - round(vo.customer_price_minor * $6)::bigint) > dso.supplier_cost_minor
      AND EXISTS (
        SELECT 1 FROM product_media pm
        WHERE pm.canonical_variant_id=cv.id
          AND pm.kind='image'
          AND pm.moderation_status='approved'
          AND pm.rights_status='approved'
          AND pm.scan_status='clean'
          AND pm.source_url IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM flash_sale_session_items old_item
        JOIN flash_sale_sessions old_session ON old_session.id=old_item.session_id
        WHERE old_session.user_id=u.id
          AND old_item.canonical_variant_id=cv.id
          AND old_session.sale_date >= ((now() AT TIME ZONE $7)::date - $8::int)
      )
      AND m.id IS NOT NULL
  `, [
    NOVA_SUPPLIER_CODE,
    customerPublicId,
    MARKET_CODE,
    MIN_PRICE_MINOR,
    MAX_PRICE_MINOR,
    FLASH_DISCOUNT_RATE,
    ATHENS_TIMEZONE,
    RECENT_EXCLUSION_DAYS
  ]);
  return Number(result.rows[0]?.family_count ?? 0);
}

async function staleRefreshCandidates(customerPublicId: string): Promise<readonly RefreshCandidate[]> {
  const result = await getProductionPostgresRuntime().nativePool.query(`
    WITH candidates AS (
      SELECT
        dso.external_product_id,
        ds.owner_vendor_id::text AS owner_vendor_id,
        bool_or(EXISTS (
          SELECT 1
          FROM flash_sale_session_items old_item
          JOIN flash_sale_sessions old_session ON old_session.id=old_item.session_id
          WHERE old_session.user_id=u.id
            AND old_item.canonical_variant_id=cv.id
            AND old_session.sale_date >= ((now() AT TIME ZONE $7)::date - $8::int)
        )) AS recently_seen,
        min(dso.availability_expires_at) AS oldest_expiry
      FROM canonical_variants cv
      JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
      JOIN product_translations pt ON pt.canonical_variant_id=cv.id AND pt.locale='el'
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id AND ds.code=$1
      JOIN users u ON u.public_id=$2
      WHERE cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor BETWEEN $3 AND $4
        AND vo.msrp_minor > 0
        AND vo.customer_price_minor <= vo.msrp_minor * 0.40
        AND dso.active=true
        AND dso.external_product_id IS NOT NULL
        AND ds.owner_vendor_id IS NOT NULL
        AND dso.supplier_cost_minor IS NOT NULL
        AND (vo.customer_price_minor - round(vo.customer_price_minor * $5)::bigint) > dso.supplier_cost_minor
        AND (dso.availability_expires_at IS NULL OR dso.availability_expires_at <= now())
        AND EXISTS (
          SELECT 1 FROM product_media pm
          WHERE pm.canonical_variant_id=cv.id
            AND pm.kind='image'
            AND pm.moderation_status='approved'
            AND pm.rights_status='approved'
            AND pm.scan_status='clean'
            AND pm.source_url IS NOT NULL
        )
      GROUP BY dso.external_product_id, ds.owner_vendor_id
    )
    SELECT external_product_id, owner_vendor_id
    FROM candidates
    ORDER BY recently_seen ASC, oldest_expiry ASC NULLS FIRST, external_product_id
    LIMIT $6
  `, [
    NOVA_SUPPLIER_CODE,
    customerPublicId,
    MIN_PRICE_MINOR,
    MAX_PRICE_MINOR,
    FLASH_DISCOUNT_RATE,
    MAX_TARGETED_REFRESH_PRODUCTS,
    ATHENS_TIMEZONE,
    RECENT_EXCLUSION_DAYS
  ]);

  return result.rows
    .map((row) => ({
      external_product_id: String(row.external_product_id ?? "").trim(),
      owner_vendor_id: String(row.owner_vendor_id ?? "").trim()
    }))
    .filter((row) => row.external_product_id && row.owner_vendor_id);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

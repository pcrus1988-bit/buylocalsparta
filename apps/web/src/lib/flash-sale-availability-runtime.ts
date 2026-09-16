import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  novaAvailabilityRequestsPerMinute,
  runNovaAvailabilityRefreshForProduct
} from "./nova-availability-refresh-runtime";

const NOVA_SUPPLIER_CODE = "nova_brandsgateway";
const MIN_PRICE_MINOR = 10_000;
const MAX_PRICE_MINOR = 50_000;
const FLASH_DISCOUNT_RATE = 0.20;
const MAX_TARGETED_REFRESH_PRODUCTS = 14;
const WARMUP_LEAD_MINUTES = 30;
const WARMUP_PACING_BUDGET_MS = 36_000;

type RefreshCandidate = Readonly<{
  external_product_id: string;
  owner_vendor_id: string;
}>;

export type FlashSaleAvailabilityWarmupResult = Readonly<{
  candidates: number;
  attemptedProducts: number;
  refreshedProducts: number;
  failedProducts: number;
  updatedOffers: number;
  requestsPerMinute: number;
}>;

/**
 * Keep Flash Sale supplier evidence warm outside the customer request path.
 *
 * The customer-facing game remains fail-closed: startFlashSale still requires fresh,
 * supplier-authoritative availability. This worker only refreshes already-approved,
 * otherwise-eligible NOVA offers whose two-hour evidence is stale or nearing expiry.
 * It never publishes products, changes prices, bypasses margin checks, or creates
 * Flash entitlements.
 */
export async function runFlashSaleAvailabilityWarmup(
  requestedMaxProducts = MAX_TARGETED_REFRESH_PRODUCTS
): Promise<FlashSaleAvailabilityWarmupResult> {
  const requestsPerMinute = novaAvailabilityRequestsPerMinute();
  const requestSpacingMs = Math.ceil(60_000 / requestsPerMinute);
  const maxByPacingBudget = Math.max(1, Math.floor(WARMUP_PACING_BUDGET_MS / requestSpacingMs) + 1);
  const safeRequestedMax = Number.isSafeInteger(requestedMaxProducts) && requestedMaxProducts > 0
    ? Math.min(requestedMaxProducts, MAX_TARGETED_REFRESH_PRODUCTS)
    : MAX_TARGETED_REFRESH_PRODUCTS;
  const maxProducts = Math.min(safeRequestedMax, maxByPacingBudget);
  const candidates = await refreshCandidates(maxProducts);

  let refreshedProducts = 0;
  let failedProducts = 0;
  let updatedOffers = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const result = await runNovaAvailabilityRefreshForProduct(candidate.external_product_id, candidate.owner_vendor_id);
      refreshedProducts += 1;
      updatedOffers += result.updatedOffers;
    } catch (error) {
      failedProducts += 1;
      console.error(JSON.stringify({
        level: "error",
        event: "flash_sale.availability_warmup_product_failed",
        externalProductId: candidate.external_product_id,
        message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)
      }));
    }

    if (index < candidates.length - 1) await delay(requestSpacingMs);
  }

  return {
    candidates: candidates.length,
    attemptedProducts: candidates.length,
    refreshedProducts,
    failedProducts,
    updatedOffers,
    requestsPerMinute
  };
}

async function refreshCandidates(limit: number): Promise<readonly RefreshCandidate[]> {
  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT
      dso.external_product_id,
      ds.owner_vendor_id::text AS owner_vendor_id,
      min(dso.availability_expires_at) AS refresh_due_at
    FROM canonical_variants cv
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    JOIN dropship_suppliers ds ON ds.id=dso.supplier_id AND ds.code=$1
    WHERE cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor BETWEEN $2 AND $3
      AND vo.msrp_minor > 0
      AND vo.customer_price_minor <= vo.msrp_minor * 0.40
      AND dso.active=true
      AND dso.cached_available=true
      AND dso.cached_quantity IS DISTINCT FROM 0
      AND dso.external_product_id IS NOT NULL
      AND ds.owner_vendor_id IS NOT NULL
      AND dso.supplier_cost_minor IS NOT NULL
      AND (vo.customer_price_minor - round(vo.customer_price_minor::numeric * $4::numeric)::bigint) > dso.supplier_cost_minor
      AND (
        dso.availability_expires_at IS NULL
        OR dso.availability_expires_at <= now() + ($5::int * interval '1 minute')
      )
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
    ORDER BY refresh_due_at ASC NULLS FIRST, dso.external_product_id
    LIMIT $6
  `, [
    NOVA_SUPPLIER_CODE,
    MIN_PRICE_MINOR,
    MAX_PRICE_MINOR,
    FLASH_DISCOUNT_RATE,
    WARMUP_LEAD_MINUTES,
    limit
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

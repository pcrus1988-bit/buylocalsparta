import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type MerchantEligibilityRow = SqlRow & {
  public_id: string;
  title: string;
  category_code: string;
  brand?: string | null;
  total_offers: number | string;
  approved_offers: number | string;
  archived_offers: number | string;
  draft_offers: number | string;
  hidden_or_paused_offers: number | string;
  positive_price_offers: number | string;
  approved_active_vendor_offers: number | string;
  approved_active_location_offers: number | string;
  approved_pickup_offers: number | string;
  approved_cost_eligible_offers: number | string;
  inventory_offers: number | string;
  sellable_stock_offers: number | string;
  fresh_inventory_offers: number | string;
  stale_stock_offers: number | string;
  merchant_ready_offers: number | string;
};

export type MerchantCenterProductDiagnostic = Readonly<{
  id: string;
  title: string;
  categoryCode: string;
  brand?: string;
  totalOffers: number;
  approvedOffers: number;
  archivedOffers: number;
  draftOffers: number;
  hiddenOrPausedOffers: number;
  merchantReadyOffers: number;
  blockers: readonly string[];
}>;

export type MerchantCenterEligibilityDiagnostics = Readonly<{
  persistenceAvailable: boolean;
  summary: Readonly<{
    activeCanonicals: number;
    merchantReadyCanonicals: number;
    archivedOffers: number;
    draftOffers: number;
    hiddenOrPausedOffers: number;
    staleStockOffers: number;
  }>;
  products: readonly MerchantCenterProductDiagnostic[];
}>;

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function blockers(row: MerchantEligibilityRow): readonly string[] {
  const totalOffers = count(row.total_offers);
  const approvedOffers = count(row.approved_offers);
  const positivePriceOffers = count(row.positive_price_offers);
  const activeVendorOffers = count(row.approved_active_vendor_offers);
  const activeLocationOffers = count(row.approved_active_location_offers);
  const pickupOffers = count(row.approved_pickup_offers);
  const costEligibleOffers = count(row.approved_cost_eligible_offers);
  const inventoryOffers = count(row.inventory_offers);
  const sellableStockOffers = count(row.sellable_stock_offers);
  const freshInventoryOffers = count(row.fresh_inventory_offers);
  const merchantReadyOffers = count(row.merchant_ready_offers);
  const reasons: string[] = [];

  if (merchantReadyOffers > 0) return reasons;
  if (totalOffers === 0) return ["No vendor offer exists"];
  if (approvedOffers === 0) {
    if (count(row.archived_offers) > 0) reasons.push("Offer archived / hidden by merchant");
    if (count(row.draft_offers) > 0) reasons.push("Draft offer awaits approval");
    if (reasons.length === 0) reasons.push("No approved vendor offer");
    return reasons;
  }
  if (positivePriceOffers === 0) reasons.push("No positive customer price");
  if (activeVendorOffers === 0) reasons.push("Vendor is not active");
  if (activeLocationOffers === 0) reasons.push("Offer location is not active");
  if (pickupOffers === 0) reasons.push("Pickup fulfilment is not enabled");
  if (costEligibleOffers === 0) reasons.push("Supplier cost exceeds configured ceiling");
  if (inventoryOffers === 0) reasons.push("No inventory balance exists");
  else {
    if (sellableStockOffers === 0) reasons.push("No sellable stock after reservations / safety stock / blocks");
    if (freshInventoryOffers === 0) reasons.push("Inventory confirmation is stale");
  }
  return reasons.length ? reasons : ["No offer satisfies the complete Merchant Center commerce gate"];
}

export async function getMerchantCenterEligibilityDiagnostics(
  principal: SessionPrincipal
): Promise<MerchantCenterEligibilityDiagnostics> {
  assertAdminPermission(principal, "content.read");
  if (!productionDatabaseConfigured()) {
    return {
      persistenceAvailable: false,
      summary: { activeCanonicals: 0, merchantReadyCanonicals: 0, archivedOffers: 0, draftOffers: 0, hiddenOrPausedOffers: 0, staleStockOffers: 0 },
      products: []
    };
  }

  try {
    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
    const result = await uow.withTransaction({ marketId: marketCode(), platformAccess: true }, (tx) => tx.query<MerchantEligibilityRow>(`
      WITH active AS (
        SELECT cv.id,
               cv.public_id,
               COALESCE(el.title,en.title,pf.model,cv.model,cv.slug) AS title,
               c.code AS category_code,
               b.name AS brand
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN categories c ON c.id=cv.category_id
        LEFT JOIN product_families pf ON pf.id=cv.family_id
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE m.code='sparta'
          AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      )
      SELECT a.public_id,a.title,a.category_code,a.brand,
             count(vo.id)::int AS total_offers,
             count(vo.id) FILTER (WHERE vo.status='approved')::int AS approved_offers,
             count(vo.id) FILTER (WHERE vo.status='archived')::int AS archived_offers,
             count(vo.id) FILTER (WHERE vo.status='draft')::int AS draft_offers,
             count(vo.id) FILTER (WHERE vo.merchant_visible=false OR vo.merchant_pause_active=true)::int AS hidden_or_paused_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND vo.customer_price_minor>0)::int AS positive_price_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND v.status='active')::int AS approved_active_vendor_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND l.active=true)::int AS approved_active_location_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes))::int AS approved_pickup_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor))::int AS approved_cost_eligible_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND ib.offer_id IS NOT NULL)::int AS inventory_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND ib.offer_id IS NOT NULL AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1)::int AS sellable_stock_offers,
             count(vo.id) FILTER (WHERE vo.status='approved' AND ib.offer_id IS NOT NULL AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now())::int AS fresh_inventory_offers,
             count(vo.id) FILTER (WHERE ib.offer_id IS NOT NULL AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1 AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)<=now())::int AS stale_stock_offers,
             count(vo.id) FILTER (
               WHERE vo.status='approved'
                 AND vo.customer_price_minor>0
                 AND v.status='active'
                 AND l.active=true
                 AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
                 AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
                 AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
                 AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
             )::int AS merchant_ready_offers
      FROM active a
      LEFT JOIN vendor_offers vo ON vo.canonical_variant_id=a.id
      LEFT JOIN vendor_businesses v ON v.id=vo.vendor_id
      LEFT JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      GROUP BY a.id,a.public_id,a.title,a.category_code,a.brand
      ORDER BY a.title,a.public_id
    `), { readOnly: true });

    const products = result.rows.map((row): MerchantCenterProductDiagnostic => ({
      id: String(row.public_id),
      title: String(row.title),
      categoryCode: String(row.category_code),
      brand: optionalText(row.brand),
      totalOffers: count(row.total_offers),
      approvedOffers: count(row.approved_offers),
      archivedOffers: count(row.archived_offers),
      draftOffers: count(row.draft_offers),
      hiddenOrPausedOffers: count(row.hidden_or_paused_offers),
      merchantReadyOffers: count(row.merchant_ready_offers),
      blockers: blockers(row)
    }));

    return {
      persistenceAvailable: true,
      summary: {
        activeCanonicals: products.length,
        merchantReadyCanonicals: products.filter((product) => product.merchantReadyOffers > 0).length,
        archivedOffers: result.rows.reduce((sum, row) => sum + count(row.archived_offers), 0),
        draftOffers: result.rows.reduce((sum, row) => sum + count(row.draft_offers), 0),
        hiddenOrPausedOffers: result.rows.reduce((sum, row) => sum + count(row.hidden_or_paused_offers), 0),
        staleStockOffers: result.rows.reduce((sum, row) => sum + count(row.stale_stock_offers), 0)
      },
      products
    };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "merchant_center.admin_diagnostics_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return {
      persistenceAvailable: false,
      summary: { activeCanonicals: 0, merchantReadyCanonicals: 0, archivedOffers: 0, draftOffers: 0, hiddenOrPausedOffers: 0, staleStockOffers: 0 },
      products: []
    };
  }
}

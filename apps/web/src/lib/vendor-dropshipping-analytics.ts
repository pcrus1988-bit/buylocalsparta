import { assertVendorCapability, type VendorOperatingContext } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";
import type { VendorProductAnalyticsRow } from "./vendor-product-analytics";

export type DropshippingSupplierAnalytics = Readonly<{
  supplierCode: string;
  periodDays: number;
  totals: VendorProductAnalyticsRow;
  topProducts: readonly VendorProductAnalyticsRow[];
}>;

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function emptyTotals(): VendorProductAnalyticsRow {
  return {
    canonicalVariantId: "all",
    productTitle: "Όλα τα προϊόντα supplier",
    categoryId: null,
    categoryName: "Όλες οι κατηγορίες",
    impressions: 0,
    pageViews: 0,
    uniqueViewers: 0,
    engagedSeconds: 0,
    addToCarts: 0,
    checkoutStarts: 0,
    purchases: 0,
    unitsSold: 0,
    revenueMinor: 0
  };
}

export async function vendorDropshippingSupplierAnalytics(
  context: VendorOperatingContext,
  vendorIdentity: string,
  supplierCode: string,
  periodDays = 30
): Promise<DropshippingSupplierAnalytics> {
  assertVendorCapability(context, "analytics.read");
  await assertDropshippingOnlyVendor(vendorIdentity);
  const days = Number.isSafeInteger(periodDays) && periodDays > 0 ? Math.min(periodDays, 365) : 30;
  const code = supplierCode.trim().slice(0, 80);
  const totals = emptyTotals();
  if (!code || !productionDatabaseConfigured()) {
    return { supplierCode: code, periodDays: days, totals, topProducts: [] };
  }

  const pool = getProductionPostgresRuntime().nativePool;
  const vendor = await pool.query(`
    SELECT id
      FROM vendor_businesses
     WHERE public_id=$1 OR id::text=$1
     LIMIT 1
  `, [vendorIdentity]);
  if (vendor.rowCount !== 1) {
    return { supplierCode: code, periodDays: days, totals, topProducts: [] };
  }
  const vendorId = String(vendor.rows[0].id);

  const result = await pool.query(`
    WITH supplier_products AS (
      SELECT DISTINCT cv.id, cv.public_id,
        coalesce(pt_el.title, pt_en.title, cv.model, cv.public_id) AS product_title,
        coalesce(cv.category_id, pf.category_id) AS category_id,
        coalesce(ct_el.name, ct_en.name, c.code, 'Χωρίς κατηγορία') AS category_name
      FROM dropship_suppliers ds
      JOIN dropship_supplier_offers dso ON dso.supplier_id=ds.id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
      LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
      LEFT JOIN categories c ON c.id=coalesce(cv.category_id, pf.category_id)
      LEFT JOIN category_translations ct_el ON ct_el.category_id=c.id AND ct_el.locale='el'
      LEFT JOIN category_translations ct_en ON ct_en.category_id=c.id AND ct_en.locale='en'
      WHERE ds.owner_vendor_id=$1::uuid
        AND ds.code=$2
    ), fairness AS (
      SELECT fae.canonical_variant_id, count(*)::bigint AS impressions
      FROM fairness_assignment_events fae
      JOIN supplier_products sp ON sp.id=fae.canonical_variant_id
      WHERE fae.selected_vendor_id=$1::uuid
        AND fae.created_at >= now() - ($3::int * interval '1 day')
      GROUP BY fae.canonical_variant_id
    ), event_rollup AS (
      SELECT pae.canonical_variant_id,
        count(*) FILTER (WHERE event_type='page_view')::bigint AS page_views,
        count(DISTINCT visitor_hash) FILTER (WHERE event_type='page_view' AND visitor_hash IS NOT NULL)::bigint AS unique_viewers,
        coalesce(sum(engaged_seconds) FILTER (WHERE event_type='engagement'),0)::bigint AS engaged_seconds,
        count(*) FILTER (WHERE event_type='add_to_cart')::bigint AS add_to_carts,
        count(*) FILTER (WHERE event_type='checkout_started')::bigint AS checkout_starts,
        count(*) FILTER (WHERE event_type='purchase')::bigint AS purchases,
        coalesce(sum(quantity) FILTER (WHERE event_type='purchase'),0)::bigint AS units_sold,
        coalesce(sum(amount_minor) FILTER (WHERE event_type='purchase'),0)::bigint AS revenue_minor
      FROM product_analytics_events pae
      JOIN supplier_products sp ON sp.id=pae.canonical_variant_id
      WHERE pae.vendor_id=$1::uuid
        AND pae.occurred_at >= now() - ($3::int * interval '1 day')
      GROUP BY pae.canonical_variant_id
    ), metrics AS (
      SELECT sp.public_id, sp.product_title, sp.category_id, sp.category_name,
        coalesce(f.impressions,0)::bigint AS impressions,
        coalesce(e.page_views,0)::bigint AS page_views,
        coalesce(e.unique_viewers,0)::bigint AS unique_viewers,
        coalesce(e.engaged_seconds,0)::bigint AS engaged_seconds,
        coalesce(e.add_to_carts,0)::bigint AS add_to_carts,
        coalesce(e.checkout_starts,0)::bigint AS checkout_starts,
        coalesce(e.purchases,0)::bigint AS purchases,
        coalesce(e.units_sold,0)::bigint AS units_sold,
        coalesce(e.revenue_minor,0)::bigint AS revenue_minor
      FROM supplier_products sp
      LEFT JOIN fairness f ON f.canonical_variant_id=sp.id
      LEFT JOIN event_rollup e ON e.canonical_variant_id=sp.id
    )
    SELECT metrics.*,
      sum(impressions) OVER()::bigint AS total_impressions,
      sum(page_views) OVER()::bigint AS total_page_views,
      sum(unique_viewers) OVER()::bigint AS total_unique_viewers,
      sum(engaged_seconds) OVER()::bigint AS total_engaged_seconds,
      sum(add_to_carts) OVER()::bigint AS total_add_to_carts,
      sum(checkout_starts) OVER()::bigint AS total_checkout_starts,
      sum(purchases) OVER()::bigint AS total_purchases,
      sum(units_sold) OVER()::bigint AS total_units_sold,
      sum(revenue_minor) OVER()::bigint AS total_revenue_minor
    FROM metrics
    WHERE impressions > 0 OR page_views > 0 OR add_to_carts > 0 OR checkout_starts > 0 OR purchases > 0 OR revenue_minor > 0
    ORDER BY revenue_minor DESC, purchases DESC, page_views DESC, impressions DESC, product_title
    LIMIT 20
  `, [vendorId, code, days]);

  if (!result.rowCount) {
    return { supplierCode: code, periodDays: days, totals, topProducts: [] };
  }

  const first = result.rows[0];
  const scopedTotals: VendorProductAnalyticsRow = {
    ...totals,
    impressions: safeNumber(first.total_impressions),
    pageViews: safeNumber(first.total_page_views),
    uniqueViewers: safeNumber(first.total_unique_viewers),
    engagedSeconds: safeNumber(first.total_engaged_seconds),
    addToCarts: safeNumber(first.total_add_to_carts),
    checkoutStarts: safeNumber(first.total_checkout_starts),
    purchases: safeNumber(first.total_purchases),
    unitsSold: safeNumber(first.total_units_sold),
    revenueMinor: safeNumber(first.total_revenue_minor)
  };

  const topProducts: VendorProductAnalyticsRow[] = result.rows.map((row) => ({
    canonicalVariantId: String(row.public_id),
    productTitle: String(row.product_title ?? row.public_id),
    categoryId: row.category_id ? String(row.category_id) : null,
    categoryName: String(row.category_name ?? "Χωρίς κατηγορία"),
    impressions: safeNumber(row.impressions),
    pageViews: safeNumber(row.page_views),
    uniqueViewers: safeNumber(row.unique_viewers),
    engagedSeconds: safeNumber(row.engaged_seconds),
    addToCarts: safeNumber(row.add_to_carts),
    checkoutStarts: safeNumber(row.checkout_starts),
    purchases: safeNumber(row.purchases),
    unitsSold: safeNumber(row.units_sold),
    revenueMinor: safeNumber(row.revenue_minor)
  }));

  return { supplierCode: code, periodDays: days, totals: scopedTotals, topProducts };
}

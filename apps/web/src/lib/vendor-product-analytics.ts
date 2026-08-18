import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorProductFunnelRow = Readonly<{
  canonicalVariantId: string;
  productTitle: string;
  impressions: number;
  pageViews: number;
  uniqueViewers: number;
  engagedSeconds: number;
  addToCarts: number;
  checkoutStarts: number;
  purchases: number;
  unitsSold: number;
  revenueMinor: number;
}>;

function safeCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function vendorProductFunnel30d(vendorPublicId: string): Promise<readonly VendorProductFunnelRow[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT canonical_variant_public_id, product_title, impressions, page_views, unique_viewers,
           engaged_seconds, add_to_carts, checkout_starts, purchases, units_sold, revenue_minor
    FROM vendor_product_funnel_30d
    WHERE vendor_public_id=$1
    ORDER BY purchases DESC, page_views DESC, impressions DESC, product_title
    LIMIT 100
  `, [vendorPublicId]);

  return result.rows.map((row) => ({
    canonicalVariantId: String(row.canonical_variant_public_id),
    productTitle: String(row.product_title ?? row.canonical_variant_public_id),
    impressions: safeCount(row.impressions),
    pageViews: safeCount(row.page_views),
    uniqueViewers: safeCount(row.unique_viewers),
    engagedSeconds: safeCount(row.engaged_seconds),
    addToCarts: safeCount(row.add_to_carts),
    checkoutStarts: safeCount(row.checkout_starts),
    purchases: safeCount(row.purchases),
    unitsSold: safeCount(row.units_sold),
    revenueMinor: safeCount(row.revenue_minor)
  }));
}

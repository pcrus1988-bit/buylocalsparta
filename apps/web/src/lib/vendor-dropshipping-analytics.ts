import type { VendorOperatingContext } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";
import {
  vendorProductAnalytics,
  type VendorProductAnalyticsRow
} from "./vendor-product-analytics";

export type DropshippingSupplierAnalytics = Readonly<{
  supplierCode: string;
  periodDays: number;
  totals: VendorProductAnalyticsRow;
  topProducts: readonly VendorProductAnalyticsRow[];
}>;

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

function totalRows(rows: readonly VendorProductAnalyticsRow[]): VendorProductAnalyticsRow {
  return rows.reduce((acc, row) => ({
    ...acc,
    impressions: acc.impressions + row.impressions,
    pageViews: acc.pageViews + row.pageViews,
    uniqueViewers: acc.uniqueViewers + row.uniqueViewers,
    engagedSeconds: acc.engagedSeconds + row.engagedSeconds,
    addToCarts: acc.addToCarts + row.addToCarts,
    checkoutStarts: acc.checkoutStarts + row.checkoutStarts,
    purchases: acc.purchases + row.purchases,
    unitsSold: acc.unitsSold + row.unitsSold,
    revenueMinor: acc.revenueMinor + row.revenueMinor
  }), emptyTotals());
}

export async function vendorDropshippingSupplierAnalytics(
  context: VendorOperatingContext,
  vendorIdentity: string,
  supplierCode: string,
  periodDays = 30
): Promise<DropshippingSupplierAnalytics> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  const days = Number.isSafeInteger(periodDays) && periodDays > 0 ? Math.min(periodDays, 365) : 30;
  const code = supplierCode.trim().slice(0, 80);
  if (!code || !productionDatabaseConfigured()) {
    return { supplierCode: code, periodDays: days, totals: emptyTotals(), topProducts: [] };
  }

  const pool = getProductionPostgresRuntime().nativePool;
  const vendor = await pool.query(`
    SELECT id
      FROM vendor_businesses
     WHERE public_id=$1 OR id::text=$1
     LIMIT 1
  `, [vendorIdentity]);
  if (!vendor.rowCount) {
    return { supplierCode: code, periodDays: days, totals: emptyTotals(), topProducts: [] };
  }
  const vendorId = String(vendor.rows[0].id);

  const supplierVariants = await pool.query(`
    SELECT DISTINCT cv.public_id
      FROM dropship_suppliers ds
      JOIN dropship_supplier_offers dso ON dso.supplier_id=ds.id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
     WHERE ds.owner_vendor_id=$1::uuid
       AND ds.code=$2
  `, [vendorId, code]);

  const variantIds = new Set(supplierVariants.rows.map((row) => String(row.public_id)));
  if (!variantIds.size) {
    return { supplierCode: code, periodDays: days, totals: emptyTotals(), topProducts: [] };
  }

  const analytics = await vendorProductAnalytics(context, { periodDays: days });
  const supplierRows = analytics.rows.filter((row) => variantIds.has(row.canonicalVariantId));
  const topProducts = [...supplierRows]
    .sort((a, b) => b.revenueMinor - a.revenueMinor || b.purchases - a.purchases || b.pageViews - a.pageViews || b.impressions - a.impressions)
    .slice(0, 20);

  return {
    supplierCode: code,
    periodDays: days,
    totals: totalRows(supplierRows),
    topProducts
  };
}

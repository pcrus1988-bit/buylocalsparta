import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

/**
 * Customer-safe MSRP projection. This deliberately reads only vendor_offers and
 * supplier-offer identity and never joins the private pricing-input table
 * (buying cost / markup / discount).
 *
 * Local offers continue to respect the vendor `show_msrp` control. Active
 * dropshipping offers are intentionally allowed to expose a genuine MSRP even
 * when that legacy local-offer flag is false, so supplier catalogue products can
 * present the same reference-price/saving treatment as BAZAAR.
 *
 * It fails closed during staged rollouts where application code reaches a
 * database before the relevant pricing schema has been applied.
 */
export const getVisibleOfferMsrpMinor = cache(async (
  canonicalVariantId: string,
  vendorId: string | undefined,
  retailPriceMinor: number
): Promise<number | undefined> => {
  if (!vendorId || !productionDatabaseConfigured() || !Number.isSafeInteger(retailPriceMinor) || retailPriceMinor < 0) return undefined;
  try {
    const result = await getProductionPostgresRuntime().nativePool.query(`
      SELECT vo.msrp_minor
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN vendor_businesses vb ON vb.id=vo.vendor_id
      WHERE cv.public_id=$1
        AND vb.public_id=$2
        AND vo.status='approved'
        AND vo.customer_price_minor=$3
        AND vo.msrp_minor IS NOT NULL
        AND vo.msrp_minor>vo.customer_price_minor
        AND (
          vo.show_msrp=true
          OR EXISTS (
            SELECT 1
            FROM dropship_supplier_offers dso
            JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
            WHERE dso.vendor_offer_id=vo.id
              AND dso.active=true
              AND ds.active=true
          )
        )
      ORDER BY vo.updated_at DESC,vo.public_id
      LIMIT 1
    `, [canonicalVariantId, vendorId, retailPriceMinor]);
    if (!result.rowCount) return undefined;
    const value = Number(result.rows[0]?.msrp_minor);
    return Number.isSafeInteger(value) && value > retailPriceMinor ? value : undefined;
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "storefront.msrp_projection_unavailable",
      canonicalVariantId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return undefined;
  }
});

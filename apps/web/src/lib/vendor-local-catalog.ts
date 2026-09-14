import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata } from "./catalog-metadata";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type LocalVendorCatalogRow = Readonly<{
  id: string;
  slug: string;
  title: string;
  category_code: string;
  price_minor: number | string;
  available_to_sell: number | string;
  vendor_id: string;
  vendor_name: string;
}>;

function safeMinor(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Initial vendor storefront projection for genuine local inventory only.
 *
 * Dropshipping offers are deliberately excluded here. VendorCatalogBrowser already
 * retrieves the complete public vendor catalogue from /api/catalog/vendor/:id in
 * bounded 20-item pages. For vendors that have any dropshipping catalogue at all,
 * skip this SSR projection entirely so the first byte is not blocked by scanning
 * tens of thousands of supplier-backed vendor offers just to discover the handful
 * of local rows. Local-only vendors retain the SSR fallback below.
 */
export async function getVendorLocalCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];

  const pool = getProductionPostgresRuntime().nativePool;
  const supplierPresence = await pool.query<{ present: number }>(`
    SELECT 1 AS present
    FROM vendor_businesses v
    JOIN vendor_offers vo ON vo.vendor_id = v.id
    JOIN dropship_supplier_offers dso ON dso.vendor_offer_id = vo.id
    WHERE v.public_id = $1
    LIMIT 1
  `, [vendorId]);
  if ((supplierPresence.rowCount ?? 0) > 0) return [];

  const result = await pool.query<LocalVendorCatalogRow>(`
    SELECT DISTINCT ON (cv.id)
      cv.public_id AS id,
      cv.slug,
      COALESCE(NULLIF(el.title, ''), NULLIF(en.title, ''), NULLIF(cv.model, ''), NULLIF(pf.model, ''), cv.slug) AS title,
      COALESCE(c.code, 'other') AS category_code,
      vo.customer_price_minor AS price_minor,
      GREATEST(
        0,
        COALESCE(ib.on_hand, 0)
          - COALESCE(ib.active_reservations, 0)
          - COALESCE(ib.safety_stock, 0)
          - COALESCE(ib.blocked, 0)
      ) AS available_to_sell,
      v.public_id AS vendor_id,
      COALESCE(NULLIF(v.trading_name, ''), v.legal_name) AS vendor_name
    FROM vendor_businesses v
    JOIN vendor_offers vo ON vo.vendor_id = v.id
    JOIN canonical_variants cv ON cv.id = vo.canonical_variant_id
    JOIN vendor_locations l ON l.id = vo.location_id
    LEFT JOIN dropship_supplier_offers dso ON dso.vendor_offer_id = vo.id
    LEFT JOIN inventory_balances ib ON ib.offer_id = vo.id
    LEFT JOIN product_families pf ON pf.id = cv.family_id
    LEFT JOIN categories c ON c.id = cv.category_id
    LEFT JOIN product_translations el ON el.canonical_variant_id = cv.id AND el.locale = 'el'
    LEFT JOIN product_translations en ON en.canonical_variant_id = cv.id AND en.locale = 'en'
    WHERE v.public_id = $1
      AND dso.id IS NULL
      AND cv.active = true
      AND cv.suppressed = false
      AND cv.recalled = false
      AND COALESCE(cv.commerce_channel, 'normal') = 'normal'
      AND vo.status = 'approved'
      AND COALESCE(vo.merchant_visible, true) = true
      AND COALESCE(vo.merchant_pause_active, false) = false
      AND l.active = true
      AND vo.customer_price_minor IS NOT NULL
      AND vo.customer_price_minor > 0
    ORDER BY cv.id, ib.stock_confirmed_at DESC NULLS LAST, vo.updated_at DESC, vo.public_id
  `, [vendorId]);

  const rows = result.rows.filter((row) => row.id && row.slug && isPublicCatalogueTitle(row.title));
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [metadata, departmentCodes] = await Promise.all([
    loadCatalogMetadata(ids),
    loadCatalogDepartmentCodes(ids),
  ]);

  let imagesByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(rows.map((row) => ({
      canonicalVariantId: row.id,
      preferredVendorId: vendorId,
    })));
    imagesByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.vendor_local_media_projection_failed",
      vendorId,
      message: error instanceof Error ? error.message : String(error),
    }));
  }

  return rows.map((row) => {
    const details = metadata.get(row.id);
    const image = imagesByCanonical.get(row.id);
    const priceMinor = safeMinor(row.price_minor);
    const availableToSell = safeMinor(row.available_to_sell);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      priceMinor,
      price: formatMoney(money(priceMinor)),
      categoryCode: row.category_code,
      departmentCode: departmentCodes.get(row.id),
      categoryLabel: details?.categoryLabel,
      gtin: details?.gtin,
      mpn: details?.mpn,
      description: details?.description,
      brand: details?.brand,
      brandLogoObjectKey: details?.brandLogoObjectKey,
      color: details?.color,
      sizes: details?.sizes ?? [],
      fit: details?.fit,
      composition: details?.composition,
      madeIn: details?.madeIn,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      availableToSell,
      available: availableToSell > 0,
    } satisfies CatalogCard;
  });
}

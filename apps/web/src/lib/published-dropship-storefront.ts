import { formatMoney, money, normalizeSearchText, searchTextRelevance } from "@buy-local-sparta/core";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import { matchesCatalogAttributeFilters } from "./catalog-attribute-filter";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { approvedCatalogImages } from "./public-media-service";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { categoryCodeMatches } from "./storefront-taxonomy";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type PublishedDropshipRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  cached_quantity: number | string | null;
  vendor_public_id: string;
  vendor_name: string;
}>;

function safeMinor(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function safeQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function sameFilterValue(left: string | undefined, right: string | undefined): boolean {
  if (!right) return true;
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

/**
 * Public browsing projection for explicitly published dropshipping offers.
 *
 * `dropship_supplier_offers.cached_*` is deliberately used only as catalogue
 * browsing evidence. It is not a checkout/reservation authority and it must never
 * be copied into `inventory_balances`. Checkout still has to revalidate the exact
 * supplier variant against the supplier API before an order can be authorised.
 */
export async function getPublishedDropshipCatalogCards(
  query = "",
  category = "",
  filters: CatalogFilters = {},
  attributeFilters: CatalogAttributeFilters = {},
  vendorId?: string
): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];

  const result = await getProductionPostgresRuntime().nativePool.query<PublishedDropshipRow>(`
    SELECT DISTINCT ON (cv.id)
      cv.public_id AS canonical_public_id,
      cv.slug,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      c.code AS category_code,
      vo.customer_price_minor,
      dso.cached_quantity,
      v.public_id AS vendor_public_id,
      v.trading_name AS vendor_name
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN markets m ON m.id=cv.market_id
    JOIN categories c ON c.id=cv.category_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE m.code='sparta'
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
      AND dso.cached_available=true
      AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      AND ($1::text IS NULL OR v.public_id=$1)
    ORDER BY cv.id,dso.availability_checked_at DESC NULLS LAST,vo.updated_at DESC,vo.public_id
  `, [vendorId ?? null]);

  const base = result.rows.flatMap((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    if (!priceMinor || !isPublicCatalogueTitle(row.title)) return [];
    return [{
      id: row.canonical_public_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      priceMinor,
      available: true,
      availableToSell: safeQuantity(row.cached_quantity),
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name
    }];
  });
  if (!base.length) return [];

  const departmentCodes = await loadCatalogDepartmentCodes(base.map((record) => record.id));
  const metadata = await loadCatalogMetadata(base.map((record) => record.id));
  const normalizedQuery = normalizeSearchText(query);

  const visible = base
    .map((record) => ({ ...record, departmentCode: departmentCodes.get(record.id) }))
    .filter((record) => categoryCodeMatches(record.categoryCode, category, record.departmentCode))
    .filter((record) => {
      const details = metadata.get(record.id);
      if (filters.subcategory && record.categoryCode !== filters.subcategory) return false;
      if (!sameFilterValue(details?.brand, filters.brand)) return false;
      if (!sameFilterValue(details?.color, filters.color)) return false;
      if (filters.size && !(details?.sizes ?? []).some((size) => sameFilterValue(size, filters.size))) return false;
      if (!matchesCatalogAttributeFilters(details?.attributes, attributeFilters)) return false;
      if (!normalizedQuery) return true;
      return searchTextRelevance(normalizedQuery, [
        record.title,
        details?.description,
        details?.brand,
        details?.color,
        details?.mpn,
        details?.gtin,
        details?.categoryLabel,
        ...(details?.sizes ?? []),
        details?.fit,
        details?.composition,
        details?.madeIn
      ]) > 0;
    });

  let imageByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(visible.map((record) => ({
      canonicalVariantId: record.id,
      preferredVendorId: record.vendorId
    })));
    imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.dropship_public_media_projection_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return visible.map((record) => {
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
    return {
      ...record,
      price: formatMoney(money(record.priceMinor)),
      categoryLabel: details?.categoryLabel,
      gtin: details?.gtin,
      mpn: details?.mpn,
      description: details?.description,
      brand: details?.brand,
      color: details?.color,
      sizes: details?.sizes ?? [],
      fit: details?.fit,
      composition: details?.composition,
      madeIn: details?.madeIn,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText
    } satisfies CatalogCard;
  });
}

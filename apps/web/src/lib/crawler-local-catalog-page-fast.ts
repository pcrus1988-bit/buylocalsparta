import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { getPublicProductDetails } from "./public-product-detail";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getLocalStorefrontReadModelWindow } from "./storefront-read-model";
import { storefrontCategoryBySlug } from "./storefront-taxonomy";

const MAX_CRAWLER_PAGE_SIZE = 36;

type CrawlerLocalFilters = CatalogFilters & Readonly<{ fit?: string }>;

type CrawlerLocalRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  available_to_sell: number | string;
  vendor_public_id: string;
  vendor_name: string;
}>;

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

function categoryPrefixes(category: string): readonly string[] {
  const normalized = normalizeCategory(category);
  if (!normalized) return [];
  const governed = storefrontCategoryBySlug(normalized);
  return governed ? governed.aliases.map(normalizeCategory) : [normalized];
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Bounded crawler/local projection.
 *
 * Discovery happens against the indexed storefront read model first. Only the
 * selected <=36 canonical IDs are then revalidated against authoritative local
 * offer/inventory state, so a dropship-heavy catalogue never forces a crawler or
 * homepage request to rescan the full offer graph.
 */
export async function getCrawlerLocalCatalogPageFast(
  _postcode = "23100",
  query = "",
  category = "",
  filters: CrawlerLocalFilters = {},
  requestedLimit = 30
): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured() || requestedLimit <= 0) return [];

  const limit = Math.max(1, Math.min(MAX_CRAWLER_PAGE_SIZE, requestedLimit));
  const candidates = await getLocalStorefrontReadModelWindow({
    prefixes: categoryPrefixes(category),
    query,
    filters,
    limit,
    offset: 0
  });
  if (!candidates.length) return [];

  const ids = candidates.map((candidate) => candidate.canonical_public_id);
  const result = await getProductionPostgresRuntime().nativePool.query<CrawlerLocalRow>(`
    SELECT DISTINCT ON (cv.public_id)
      cv.public_id AS canonical_public_id,
      cv.slug,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      c.code AS category_code,
      vo.customer_price_minor,
      GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::integer AS available_to_sell,
      v.public_id AS vendor_public_id,
      v.trading_name AS vendor_name
    FROM canonical_variants cv
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN inventory_balances ib ON ib.offer_id=vo.id
    WHERE cv.public_id=ANY($1::text[])
      AND COALESCE(cv.commerce_channel,'normal')='normal'
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
      AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
    ORDER BY cv.public_id,ib.stock_confirmed_at DESC,vo.customer_price_minor,vo.public_id
  `, [ids]);

  const rowById = new Map(result.rows.map((row) => [row.canonical_public_id, row]));
  const rows = candidates.flatMap((candidate) => {
    const row = rowById.get(candidate.canonical_public_id);
    if (!row) return [];
    const priceMinor = positiveInt(row.customer_price_minor);
    const availableToSell = positiveInt(row.available_to_sell);
    if (!priceMinor || !availableToSell) return [];
    return [{ candidate, row, priceMinor, availableToSell }];
  });
  if (!rows.length) return [];

  const hydratedIds = rows.map(({ row }) => row.canonical_public_id);
  const [metadata, sourceDetails] = await Promise.all([
    loadCatalogMetadata(hydratedIds),
    getPublicProductDetails(hydratedIds)
  ]);

  let imageByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(rows.map(({ row }) => ({
      canonicalVariantId: row.canonical_public_id,
      preferredVendorId: row.vendor_public_id
    })));
    imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "crawler.local_media_projection_failed",
      canonicalVariantCount: hydratedIds.length,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return rows.map(({ candidate, row, priceMinor, availableToSell }) => {
    const details = metadata.get(row.canonical_public_id);
    const sourceDetail = sourceDetails.get(row.canonical_public_id);
    const image = imageByCanonical.get(row.canonical_public_id);
    return {
      id: row.canonical_public_id,
      slug: row.slug,
      title: details?.title ?? row.title,
      priceMinor,
      price: formatMoney(money(priceMinor)),
      categoryCode: row.category_code,
      departmentCode: candidate.department_code ?? undefined,
      categoryLabel: details?.categoryLabel,
      gtin: details?.gtin ?? sourceDetail?.sourceGtin,
      mpn: details?.mpn,
      description: details?.description ?? sourceDetail?.description,
      brand: details?.brand ?? sourceDetail?.brand,
      brandLogoObjectKey: details?.brandLogoObjectKey,
      color: details?.color,
      sizes: details?.sizes ?? [],
      fit: details?.fit,
      composition: details?.composition,
      madeIn: details?.madeIn,
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      sourceImageAvailable: Boolean(sourceDetail?.sourceImageUrl),
      available: true,
      availableToSell
    } satisfies CatalogCard;
  });
}

import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getPublicProductDetails } from "./public-product-detail";
import { approvedCatalogImages } from "./public-media-service";
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
 * Read-only crawler catalogue projection for local stock.
 *
 * This deliberately starts from fresh, sellable local offers and applies category,
 * query and standard storefront filters before LIMIT. Only the resulting <=36
 * canonical IDs reach metadata/media hydration. It never calls publicCanonicals(),
 * never projects the full SEO inventory, and never mutates fairness/sticky state.
 */
export async function getCrawlerLocalCatalogPage(
  postcode = "23100",
  query = "",
  category = "",
  filters: CrawlerLocalFilters = {},
  requestedLimit = 30
): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured() || requestedLimit <= 0) return [];

  const limit = Math.max(1, Math.min(MAX_CRAWLER_PAGE_SIZE, requestedLimit));
  const prefixes = categoryPrefixes(category);
  const result = await getProductionPostgresRuntime().nativePool.query<CrawlerLocalRow>(`
    WITH RECURSIVE category_tree AS (
      SELECT c.id,c.parent_id,c.code,c.code AS department_code
      FROM categories c
      JOIN markets m ON m.id=c.market_id
      WHERE m.code='sparta' AND c.parent_id IS NULL
      UNION ALL
      SELECT child.id,child.parent_id,child.code,parent.department_code
      FROM categories child
      JOIN category_tree parent ON child.parent_id=parent.id
    ), eligible AS MATERIALIZED (
      SELECT
        cv.id AS canonical_id,
        cv.public_id AS canonical_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        c.code AS category_code,
        cv.created_at,
        vo.customer_price_minor,
        GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::integer AS available_to_sell,
        v.public_id AS vendor_public_id,
        v.trading_name AS vendor_name,
        ib.stock_confirmed_at,
        vo.public_id AS offer_public_id
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN category_tree tree ON tree.id=cv.category_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE m.code='sparta'
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
        AND (
          cardinality($1::text[])=0 OR EXISTS (
            SELECT 1
            FROM unnest($1::text[]) prefix
            WHERE lower(c.code)=prefix
               OR lower(c.code) LIKE prefix||'-%'
               OR lower(tree.department_code)=prefix
               OR lower(tree.department_code) LIKE prefix||'-%'
          )
        )
        AND ($2::text='' OR c.code=$2)
        AND ($3::text='' OR lower(COALESCE(b.name,''))=lower($3))
        AND ($4::text='' OR lower(COALESCE(el.specifications->>'color',en.specifications->>'color',cv.variant_attributes->>'color',''))=lower($4))
        AND ($5::text='' OR COALESCE(el.specifications->'sizes',en.specifications->'sizes','[]'::jsonb) ? $5 OR COALESCE(cv.variant_attributes->'sizes_observed','[]'::jsonb) ? $5)
        AND ($6::text='' OR lower(COALESCE(el.specifications->>'fit',en.specifications->>'fit',''))=lower($6))
        AND (
          $7::text='' OR
          to_tsvector('simple',concat_ws(' ',
            COALESCE(el.title,en.title,cv.model,cv.slug),
            COALESCE(el.description,en.description,''),
            COALESCE(b.name,''),
            COALESCE(cv.gtin,''),
            COALESCE(cv.mpn,''),
            c.code
          )) @@ plainto_tsquery('simple',$7)
          OR COALESCE(cv.gtin,'')=$7
          OR lower(COALESCE(cv.mpn,''))=lower($7)
        )
    ), ranked AS (
      SELECT eligible.*,
             ROW_NUMBER() OVER (
               PARTITION BY canonical_id
               ORDER BY stock_confirmed_at DESC,customer_price_minor,offer_public_id
             ) AS offer_rank
      FROM eligible
    )
    SELECT
      canonical_public_id,
      slug,
      title,
      category_code,
      customer_price_minor,
      available_to_sell,
      vendor_public_id,
      vendor_name
    FROM ranked
    WHERE offer_rank=1
    ORDER BY created_at DESC,canonical_public_id
    LIMIT $8
  `, [
    prefixes,
    filters.subcategory ?? "",
    filters.brand ?? "",
    filters.color ?? "",
    filters.size ?? "",
    filters.fit ?? "",
    query.trim(),
    limit
  ]);

  const rows = result.rows.flatMap((row) => {
    const priceMinor = positiveInt(row.customer_price_minor);
    const availableToSell = positiveInt(row.available_to_sell);
    if (!priceMinor || !availableToSell || !row.vendor_public_id || !row.vendor_name) return [];
    return [{ row, priceMinor, availableToSell }];
  });
  if (!rows.length) return [];

  const ids = rows.map(({ row }) => row.canonical_public_id);
  const [metadata, departmentCodes, sourceDetails] = await Promise.all([
    loadCatalogMetadata(ids),
    loadCatalogDepartmentCodes(ids),
    getPublicProductDetails(ids)
  ]);

  let imageByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(rows.map(({ row }) => ({
      canonicalVariantId: row.canonical_public_id,
      preferredVendorId: row.vendor_public_id
    })));
    imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId,image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "crawler.local_media_projection_failed",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return rows.map(({ row, priceMinor, availableToSell }) => {
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
      departmentCode: departmentCodes.get(row.canonical_public_id),
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

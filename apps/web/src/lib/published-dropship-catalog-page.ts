import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { matchesCatalogAttributeFilters, type CatalogAttributeFilters } from "./catalog-attribute-filter";
import { loadCatalogMetadata } from "./catalog-metadata";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { getPublicCatalogSourcePrimaryImages } from "./public-catalog-source-gallery";
import { approvedCatalogImages } from "./public-media-service";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { storefrontCategoryBySlug } from "./storefront-taxonomy";

const MAX_PAGE_SIZE = 36;

type PublishedDropshipPageRow = Readonly<{
  canonical_public_id: string;
  family_id: string | null;
  supplier_id: string;
  external_product_id: string;
  offer_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  department_code: string | null;
  customer_price_minor: number | string;
  cached_quantity: number | string | null;
  vendor_public_id: string;
  vendor_name: string;
  vendor_presentation: unknown;
  is_match: boolean;
  total_families: number | string;
}>;

type ShopDropshipCard = CatalogCard & Readonly<{
  supplierFulfilled: true;
  previewImageSrc?: string;
}>;

export type PublishedDropshipCatalogPage = Readonly<{
  products: readonly ShopDropshipCard[];
  total: number;
  hasMore: boolean;
}>;

export type PublishedDropshipCatalogPageInput = Readonly<{
  query?: string;
  category?: string;
  filters?: CatalogFilters & Readonly<{ fit?: string }>;
  attributeFilters?: CatalogAttributeFilters;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort?: string;
  limit?: number;
  offset?: number;
}>;

function safeMinor(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function safeQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function safeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

function categoryPrefixes(category: string): readonly string[] {
  const normalized = normalizeCategory(category);
  if (!normalized) return [];
  const governed = storefrontCategoryBySlug(normalized);
  return governed ? governed.aliases.map(normalizeCategory) : [normalized];
}

/**
 * Paginated NORMAL-channel dropshipping discovery. Postgres identifies only the
 * requested family window first; application code receives those families and
 * their sellable siblings rather than the complete supplier catalogue.
 */
export async function getPublishedDropshipCatalogPage(
  input: PublishedDropshipCatalogPageInput = {}
): Promise<PublishedDropshipCatalogPage> {
  if (!productionDatabaseConfigured()) return { products: [], total: 0, hasMore: false };

  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, input.limit ?? 30));
  const offset = Math.max(0, input.offset ?? 0);
  const filters = input.filters ?? {};
  const attributeFilters = input.attributeFilters ?? {};
  const prefixes = categoryPrefixes(input.category ?? "");
  const query = (input.query ?? "").trim();

  const result = await getProductionPostgresRuntime().nativePool.query<PublishedDropshipPageRow>(`
    WITH RECURSIVE category_tree AS (
      SELECT c.id,c.parent_id,c.code,c.code AS department_code
      FROM categories c
      JOIN markets m ON m.id=c.market_id
      WHERE m.code='sparta' AND c.parent_id IS NULL
      UNION ALL
      SELECT child.id,child.parent_id,child.code,parent.department_code
      FROM categories child
      JOIN category_tree parent ON child.parent_id=parent.id
    ), base AS (
      SELECT DISTINCT ON (cv.id)
        cv.public_id AS canonical_public_id,
        cv.family_id::text AS family_id,
        dso.supplier_id::text AS supplier_id,
        dso.external_product_id,
        dso.supplier_id::text||':'||dso.external_product_id AS source_family_key,
        vo.public_id AS offer_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        COALESCE(el.description,en.description,'') AS description,
        c.code AS category_code,
        tree.department_code,
        b.name AS brand_name,
        COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications,
        cv.variant_attributes,
        vo.customer_price_minor,
        dso.cached_quantity,
        v.public_id AS vendor_public_id,
        v.trading_name AS vendor_name,
        ds.configuration->'vendorPresentation' AS vendor_presentation,
        cv.created_at
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN category_tree tree ON tree.id=cv.category_id
      LEFT JOIN product_families family ON family.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,family.brand_id)
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
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
        AND dso.active=true
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND dso.cached_available=true
        AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      ORDER BY cv.id,vo.customer_price_minor ASC,dso.availability_checked_at DESC NULLS LAST,vo.updated_at DESC,vo.public_id
    ), matching_children AS (
      SELECT *
      FROM base
      WHERE (
          cardinality($1::text[])=0 OR EXISTS (
            SELECT 1 FROM unnest($1::text[]) prefix
            WHERE lower(category_code)=prefix
               OR lower(category_code) LIKE prefix||'-%'
               OR lower(department_code)=prefix
               OR lower(department_code) LIKE prefix||'-%'
          )
        )
        AND ($2::text='' OR category_code=$2)
        AND ($3::text='' OR lower(COALESCE(brand_name,''))=lower($3))
        AND ($4::text='' OR lower(COALESCE(specifications->>'color',variant_attributes->>'color',''))=lower($4))
        AND ($5::text='' OR COALESCE(specifications->'sizes','[]'::jsonb) ? $5 OR COALESCE(variant_attributes->'sizes_observed','[]'::jsonb) ? $5)
        AND ($6::text='' OR lower(COALESCE(specifications->>'fit',''))=lower($6))
        AND ($7::bigint IS NULL OR customer_price_minor>=$7)
        AND ($8::bigint IS NULL OR customer_price_minor<=$8)
        AND (
          $9::text='' OR
          to_tsvector('simple',concat_ws(' ',title,description,COALESCE(brand_name,''),category_code)) @@ plainto_tsquery('simple',$9)
        )
    ), matching_families AS (
      SELECT
        source_family_key,
        MAX(created_at) AS newest_at,
        MIN(customer_price_minor) AS sort_price_minor
      FROM matching_children
      GROUP BY source_family_key
    ), page_families AS (
      SELECT source_family_key,newest_at,sort_price_minor,COUNT(*) OVER() AS total_families
      FROM matching_families
      ORDER BY
        CASE WHEN $10='price-asc' THEN sort_price_minor END ASC,
        CASE WHEN $10='price-desc' THEN sort_price_minor END DESC,
        CASE WHEN $10 NOT IN ('price-asc','price-desc') THEN newest_at END DESC,
        source_family_key
      LIMIT $11 OFFSET $12
    )
    SELECT
      base.canonical_public_id,
      base.family_id,
      base.supplier_id,
      base.external_product_id,
      base.offer_public_id,
      base.slug,
      base.title,
      base.category_code,
      base.department_code,
      base.customer_price_minor,
      base.cached_quantity,
      base.vendor_public_id,
      base.vendor_name,
      base.vendor_presentation,
      (matching_children.canonical_public_id IS NOT NULL) AS is_match,
      page_families.total_families
    FROM page_families
    JOIN base ON base.source_family_key=page_families.source_family_key
    LEFT JOIN matching_children ON matching_children.canonical_public_id=base.canonical_public_id
    ORDER BY
      CASE WHEN $10='price-asc' THEN page_families.sort_price_minor END ASC,
      CASE WHEN $10='price-desc' THEN page_families.sort_price_minor END DESC,
      CASE WHEN $10 NOT IN ('price-asc','price-desc') THEN page_families.newest_at END DESC,
      page_families.source_family_key,
      base.customer_price_minor,
      base.canonical_public_id
  `, [
    prefixes,
    filters.subcategory ?? "",
    filters.brand ?? "",
    filters.color ?? "",
    filters.size ?? "",
    filters.fit ?? "",
    input.minPriceMinor ?? null,
    input.maxPriceMinor ?? null,
    query,
    input.sort ?? "",
    limit,
    offset
  ]);

  if (!result.rows.length) return { products: [], total: 0, hasMore: false };
  const total = safeCount(result.rows[0].total_families);

  const base = result.rows.flatMap((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    if (!priceMinor || !isPublicCatalogueTitle(row.title)) return [];
    const presentation = resolveDropshipPublicFields(
      parseDropshipPresentationConfig(row.vendor_presentation),
      row.offer_public_id
    );
    return [{
      id: row.canonical_public_id,
      familyId: row.family_id,
      supplierId: row.supplier_id,
      externalProductId: row.external_product_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      departmentCode: row.department_code ?? undefined,
      priceMinor,
      available: true,
      availableToSell: safeQuantity(row.cached_quantity),
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      publicFields: presentation.fields,
      matchedBySql: row.is_match
    }];
  });
  if (!base.length) return { products: [], total, hasMore: offset + limit < total };

  const ids = base.map((record) => record.id);
  const metadata = await loadCatalogMetadata(ids);
  const matchingIds = new Set(base.flatMap((record) => {
    if (!record.matchedBySql) return [];
    if (Object.keys(attributeFilters).length === 0) return [record.id];
    if (record.publicFields.technicalAttributes === false) return [];
    return matchesCatalogAttributeFilters(metadata.get(record.id)?.attributes, attributeFilters) ? [record.id] : [];
  }));
  if (!matchingIds.size) return { products: [], total, hasMore: offset + limit < total };

  const enriched = base.map((record) => ({
    ...record,
    sizes: metadata.get(record.id)?.sizes ?? []
  }));
  const projections = projectDropshipFamilies(enriched, matchingIds);
  const representatives = projections.map((projection) => projection.representative);
  const imageRequests = representatives.map((record) => ({
    canonicalVariantId: record.id,
    preferredVendorId: record.vendorId
  }));

  // Governed internal media remains preferred. In parallel, resolve one validated
  // supplier image per page so cards without internal media can render the source
  // asset directly rather than paying for a serverless lookup + redirect per card.
  const [images, sourcePrimaryImages] = await Promise.all([
    approvedCatalogImages(imageRequests).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.dropship_public_media_projection_failed",
        message: error instanceof Error ? error.message : String(error)
      }));
      return [];
    }),
    getPublicCatalogSourcePrimaryImages(imageRequests)
  ]);
  const imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image] as const));

  const products: ShopDropshipCard[] = projections.map((projection) => {
    const record = projection.representative;
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
    const sourceImage = sourcePrimaryImages.get(record.id);
    const technicalAttributesVisible = record.publicFields.technicalAttributes !== false;
    return {
      id: record.id,
      slug: record.slug,
      title: record.title,
      priceMinor: record.priceMinor,
      price: formatMoney(money(record.priceMinor)),
      categoryCode: record.categoryCode,
      departmentCode: record.departmentCode,
      categoryLabel: details?.categoryLabel,
      gtin: record.publicFields.gtin === false ? undefined : details?.gtin,
      mpn: record.publicFields.mpn === false ? undefined : details?.mpn,
      description: details?.description,
      brand: details?.brand,
      brandLogoObjectKey: details?.brandLogoObjectKey,
      color: details?.color,
      sizes: projection.sizes,
      fit: technicalAttributesVisible ? details?.fit : undefined,
      composition: technicalAttributesVisible ? details?.composition : undefined,
      madeIn: technicalAttributesVisible ? details?.madeIn : undefined,
      vendorId: record.vendorId,
      vendorName: record.vendorName,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText ?? sourceImage?.altText,
      previewImageSrc: image?.mediaId ? undefined : sourceImage?.src,
      available: true,
      availableToSell: projection.availableToSell,
      supplierFulfilled: true
    };
  });

  return { products, total, hasMore: offset + limit < total };
}

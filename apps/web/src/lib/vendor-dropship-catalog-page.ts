import { formatMoney, money } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata } from "./catalog-metadata";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_PAGE_SIZE = 36;
const MAX_PAGE_SIZE = 60;

export type VendorDropshipFacetOption = Readonly<{
  value: string;
  label: string;
  count: number;
}>;

export type VendorDropshipFacets = Readonly<{
  total: number;
  categories: readonly VendorDropshipFacetOption[];
  brands: readonly VendorDropshipFacetOption[];
  colors: readonly VendorDropshipFacetOption[];
  sizes: readonly VendorDropshipFacetOption[];
}>;

export type VendorDropshipCatalogPage = Readonly<{
  products: readonly CatalogCard[];
  total: number;
  offset: number;
  limit: number;
  nextOffset?: number;
}>;

export type VendorDropshipCatalogPageInput = Readonly<{
  query?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  availableOnly?: boolean;
  offset?: number;
  limit?: number;
}>;

type HiddenCategoryRow = Readonly<{ id: string }>;

type PageRow = Readonly<{
  canonical_public_id: string;
  family_id: string | null;
  supplier_id: string;
  external_product_id: string;
  offer_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  cached_quantity: number | string | null;
  currently_available: boolean;
  vendor_public_id: string;
  vendor_name: string;
  vendor_presentation: unknown;
  matches_filter: boolean;
  total_families: number | string;
}>;

type FacetRow = Readonly<{
  total: number | string;
  categories: unknown;
  brands: unknown;
  colors: unknown;
  sizes: unknown;
}>;

function safePositiveInt(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function safeMinor(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function safeQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function facetOptions(value: unknown): readonly VendorDropshipFacetOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const option = text(record.value);
    if (!option) return [];
    return [{
      value: option,
      label: text(record.label) ?? option,
      count: safePositiveInt(record.count, 0)
    }];
  });
}

async function hiddenVendorCategoryIds(vendorId: string): Promise<readonly string[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<HiddenCategoryRow>(`
    WITH RECURSIVE hidden AS (
      SELECT vcv.category_id AS id
      FROM vendor_category_visibility vcv
      JOIN vendor_businesses v ON v.id=vcv.vendor_id
      WHERE v.public_id=$1 AND vcv.visible=false
      UNION
      SELECT child.id
      FROM categories child
      JOIN hidden parent ON child.parent_id=parent.id
    )
    SELECT id::text AS id FROM hidden
  `, [vendorId]);
  return result.rows.map((row) => row.id);
}

/**
 * Family-paginated public dropshipping projection for one vendor storefront.
 *
 * The raw supplier catalogue can contain tens of thousands of child variants. The
 * query resolves family identity first, selects only one page of matching families,
 * then returns the siblings for those families so the existing family projection can
 * aggregate sizes/stock without hydrating the entire supplier catalogue in Node.
 *
 * Category-visibility governance is preserved without calling the recursive
 * vendor_category_effectively_visible() function once per supplier row: hidden roots
 * and descendants are resolved once and supplied as a small exclusion set.
 */
export async function getVendorDropshipCatalogPage(
  vendorId: string,
  input: VendorDropshipCatalogPageInput = {}
): Promise<VendorDropshipCatalogPage> {
  if (!productionDatabaseConfigured()) return { products: [], total: 0, offset: 0, limit: DEFAULT_PAGE_SIZE };

  const query = input.query?.trim().slice(0, 160) ?? "";
  const category = input.category?.trim().slice(0, 120) ?? "";
  const brand = input.brand?.trim().slice(0, 160) ?? "";
  const color = input.color?.trim().slice(0, 120) ?? "";
  const size = input.size?.trim().slice(0, 120) ?? "";
  const offset = safePositiveInt(input.offset, 0, 100_000);
  const limit = Math.max(1, safePositiveInt(input.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const hiddenCategoryIds = await hiddenVendorCategoryIds(vendorId);
  const runtime = getProductionPostgresRuntime();

  const result = await runtime.nativePool.query<PageRow>(`
    WITH vendor AS MATERIALIZED (
      SELECT id,public_id,trading_name
      FROM vendor_businesses
      WHERE public_id=$1 AND status='active'
    ), raw AS MATERIALIZED (
      SELECT
        cv.id AS canonical_uuid,
        cv.public_id AS canonical_public_id,
        cv.family_id::text AS family_id,
        dso.supplier_id::text AS supplier_id,
        dso.external_product_id,
        dso.supplier_id::text || ':' || dso.external_product_id AS source_key,
        vo.public_id AS offer_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        COALESCE(el.description,en.description,'') AS description,
        c.code AS category_code,
        cv.gtin,
        cv.mpn,
        cv.variant_attributes,
        COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications,
        NULLIF(BTRIM(COALESCE(b.name,'')),'') AS brand,
        NULLIF(BTRIM(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )),'') AS color,
        vo.customer_price_minor,
        vo.updated_at,
        dso.cached_quantity,
        dso.availability_checked_at,
        (
          dso.cached_available=true
          AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
        ) AS currently_available,
        (SELECT public_id FROM vendor) AS vendor_public_id,
        (SELECT trading_name FROM vendor) AS vendor_name,
        ds.configuration->'vendorPresentation' AS vendor_presentation
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE vo.vendor_id=(SELECT id FROM vendor)
        AND cv.market_id=(SELECT id FROM markets WHERE code='sparta')
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND l.active=true
        AND dso.active=true
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND (cardinality($9::uuid[])=0 OR NOT (cv.category_id=ANY($9::uuid[])))
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
    ), source_resolution AS MATERIALIZED (
      SELECT source_key,
             CASE WHEN COUNT(DISTINCT family_id) FILTER (WHERE family_id IS NOT NULL)=1
               THEN MAX(family_id) FILTER (WHERE family_id IS NOT NULL)
               ELSE NULL
             END AS inherited_family_id
      FROM raw
      GROUP BY source_key
    ), resolved AS MATERIALIZED (
      SELECT raw.*,
             COALESCE(raw.family_id,source_resolution.inherited_family_id,raw.source_key) AS family_key
      FROM raw
      JOIN source_resolution USING (source_key)
    ), filtered_rows AS MATERIALIZED (
      SELECT resolved.*,
        (
          ($3::text='' OR resolved.category_code=$3)
          AND ($4::text='' OR lower(COALESCE(resolved.brand,''))=lower($4))
          AND ($5::text='' OR lower(COALESCE(resolved.color,''))=lower($5))
          AND (
            $6::text='' OR
            EXISTS (
              SELECT 1
              FROM jsonb_each_text(resolved.variant_attributes) size_attr(key,value)
              WHERE lower(size_attr.key) LIKE '%size%'
                AND lower(BTRIM(size_attr.value))=lower($6)
            ) OR
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(resolved.specifications->'sizes')='array'
                  THEN resolved.specifications->'sizes'
                  ELSE '[]'::jsonb
                END
              ) size_value(value)
              WHERE lower(BTRIM(size_value.value))=lower($6)
            )
          )
          AND ($7::boolean=false OR resolved.currently_available=true)
          AND (
            $2::text='' OR
            to_tsvector('simple',concat_ws(' ',
              resolved.title,
              COALESCE(resolved.brand,''),
              COALESCE(resolved.gtin,''),
              COALESCE(resolved.mpn,''),
              resolved.category_code,
              resolved.description
            )) @@ plainto_tsquery('simple',$2)
            OR resolved.title ILIKE '%'||$2||'%'
            OR COALESCE(resolved.brand,'') ILIKE '%'||$2||'%'
            OR COALESCE(resolved.gtin,'')=$2
            OR COALESCE(resolved.mpn,'') ILIKE '%'||$2||'%'
          )
        ) AS matches_filter
      FROM resolved
    ), matched_families AS (
      SELECT family_key,MAX(updated_at) AS sort_updated
      FROM filtered_rows
      WHERE matches_filter=true
      GROUP BY family_key
    ), page_families AS (
      SELECT family_key,sort_updated,COUNT(*) OVER()::int AS total_families
      FROM matched_families
      ORDER BY sort_updated DESC,family_key
      LIMIT $8 OFFSET $10
    )
    SELECT
      rows.canonical_public_id,
      rows.family_id,
      rows.supplier_id,
      rows.external_product_id,
      rows.offer_public_id,
      rows.slug,
      rows.title,
      rows.category_code,
      rows.customer_price_minor,
      rows.cached_quantity,
      rows.currently_available,
      rows.vendor_public_id,
      rows.vendor_name,
      rows.vendor_presentation,
      rows.matches_filter,
      page.total_families
    FROM page_families page
    JOIN filtered_rows rows USING (family_key)
    ORDER BY page.sort_updated DESC,page.family_key,
             rows.currently_available DESC,
             rows.customer_price_minor ASC,
             rows.availability_checked_at DESC NULLS LAST,
             rows.updated_at DESC,
             rows.offer_public_id
  `, [
    vendorId,
    query,
    category,
    brand,
    color,
    size,
    input.availableOnly === true,
    limit,
    hiddenCategoryIds,
    offset
  ]);

  if (!result.rows.length) return { products: [], total: 0, offset, limit };

  const base = result.rows.flatMap((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    if (!priceMinor || !isPublicCatalogueTitle(row.title)) return [];
    const presentation = resolveDropshipPublicFields(
      parseDropshipPresentationConfig(row.vendor_presentation),
      row.offer_public_id
    );
    const available = row.currently_available === true;
    return [{
      id: row.canonical_public_id,
      familyId: row.family_id,
      supplierId: row.supplier_id,
      externalProductId: row.external_product_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      priceMinor,
      available,
      availableToSell: available ? safeQuantity(row.cached_quantity) : 0,
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      publicFields: presentation.fields,
      matchesFilter: row.matches_filter === true
    }];
  });

  const total = safePositiveInt(result.rows[0]?.total_families, 0);
  if (!base.length) return { products: [], total, offset, limit, nextOffset: offset + limit < total ? offset + limit : undefined };

  const ids = base.map((record) => record.id);
  const [departmentCodes, metadata] = await Promise.all([
    loadCatalogDepartmentCodes(ids),
    loadCatalogMetadata(ids)
  ]);
  const enriched = base.map((record) => ({
    ...record,
    departmentCode: departmentCodes.get(record.id),
    sizes: metadata.get(record.id)?.sizes ?? []
  }));
  const matchingIds = new Set(enriched.filter((record) => record.matchesFilter).map((record) => record.id));
  const projections = projectDropshipFamilies(enriched, matchingIds);
  const representatives = projections.map((projection) => projection.representative);

  let imageByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(representatives.map((record) => ({
      canonicalVariantId: record.id,
      preferredVendorId: record.vendorId
    })));
    imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.vendor_dropship_page_media_failed",
      vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  const products = projections.map((projection) => {
    const record = projection.representative;
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
    const {
      publicFields,
      familyId: _familyId,
      supplierId: _supplierId,
      externalProductId: _externalProductId,
      sizes: _childSizes,
      matchesFilter: _matchesFilter,
      ...catalogRecord
    } = record;
    const technicalAttributesVisible = publicFields.technicalAttributes !== false;
    return {
      ...catalogRecord,
      available: projection.availableToSell > 0,
      availableToSell: projection.availableToSell,
      price: formatMoney(money(record.priceMinor)),
      categoryLabel: details?.categoryLabel,
      gtin: publicFields.gtin === false ? undefined : details?.gtin,
      mpn: publicFields.mpn === false ? undefined : details?.mpn,
      description: details?.description,
      brand: details?.brand,
      brandLogoObjectKey: details?.brandLogoObjectKey,
      color: details?.color,
      sizes: projection.sizes,
      fit: technicalAttributesVisible ? details?.fit : undefined,
      composition: technicalAttributesVisible ? details?.composition : undefined,
      madeIn: technicalAttributesVisible ? details?.madeIn : undefined,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      supplierFulfilled: true
    } satisfies CatalogCard & Readonly<{ supplierFulfilled: true }>;
  });

  return {
    products,
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : undefined
  };
}

async function readVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) return { total: 0, categories: [], brands: [], colors: [], sizes: [] };
  const hiddenCategoryIds = await hiddenVendorCategoryIds(vendorId);
  const result = await getProductionPostgresRuntime().nativePool.query<FacetRow>(`
    WITH raw AS MATERIALIZED (
      SELECT
        cv.family_id::text AS family_id,
        dso.supplier_id::text || ':' || dso.external_product_id AS source_key,
        c.code AS category_code,
        COALESCE(ctel.name,cten.name,c.code) AS category_label,
        NULLIF(BTRIM(COALESCE(b.name,'')),'') AS brand,
        NULLIF(BTRIM(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )),'') AS color,
        cv.variant_attributes,
        COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications
      FROM vendor_offers vo
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
      LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
      WHERE v.public_id=$1
        AND m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND dso.active=true
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND (cardinality($2::uuid[])=0 OR NOT (cv.category_id=ANY($2::uuid[])))
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
    ), source_resolution AS MATERIALIZED (
      SELECT source_key,
             CASE WHEN COUNT(DISTINCT family_id) FILTER (WHERE family_id IS NOT NULL)=1
               THEN MAX(family_id) FILTER (WHERE family_id IS NOT NULL)
               ELSE NULL
             END AS inherited_family_id
      FROM raw
      GROUP BY source_key
    ), base AS MATERIALIZED (
      SELECT raw.*,
             COALESCE(raw.family_id,source_resolution.inherited_family_id,raw.source_key) AS family_key
      FROM raw
      JOIN source_resolution USING (source_key)
    ), category_values AS (
      SELECT category_code AS value,MIN(category_label) AS label,COUNT(DISTINCT family_key)::int AS count
      FROM base GROUP BY category_code
    ), brand_values AS (
      SELECT brand AS value,COUNT(DISTINCT family_key)::int AS count
      FROM base WHERE brand IS NOT NULL GROUP BY brand
    ), color_values AS (
      SELECT color AS value,COUNT(DISTINCT family_key)::int AS count
      FROM base WHERE color IS NOT NULL GROUP BY color
    ), size_values AS (
      SELECT candidate.value,COUNT(DISTINCT base.family_key)::int AS count
      FROM base
      CROSS JOIN LATERAL (
        SELECT BTRIM(attr.value) AS value
        FROM jsonb_each_text(base.variant_attributes) attr(key,value)
        WHERE lower(attr.key) LIKE '%size%' AND BTRIM(attr.value)<>''
        UNION
        SELECT BTRIM(size_value.value) AS value
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(base.specifications->'sizes')='array'
            THEN base.specifications->'sizes'
            ELSE '[]'::jsonb
          END
        ) size_value(value)
        WHERE BTRIM(size_value.value)<>''
      ) candidate
      GROUP BY candidate.value
    )
    SELECT
      (SELECT COUNT(DISTINCT family_key)::int FROM base) AS total,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'label',label,'count',count) ORDER BY label,value) FROM category_values),'[]'::jsonb) AS categories,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'label',value,'count',count) ORDER BY value) FROM brand_values),'[]'::jsonb) AS brands,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'label',value,'count',count) ORDER BY value) FROM color_values),'[]'::jsonb) AS colors,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'label',value,'count',count) ORDER BY value) FROM size_values),'[]'::jsonb) AS sizes
  `, [vendorId, hiddenCategoryIds]);
  const row = result.rows[0];
  return {
    total: safePositiveInt(row?.total, 0),
    categories: facetOptions(row?.categories),
    brands: facetOptions(row?.brands),
    colors: facetOptions(row?.colors),
    sizes: facetOptions(row?.sizes)
  };
}

const cachedVendorDropshipFacets = unstable_cache(
  readVendorDropshipFacets,
  ["vendor-dropship-storefront-facets-v1"],
  { revalidate: 300 }
);

export function getVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  return cachedVendorDropshipFacets(vendorId);
}

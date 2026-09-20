import type { CatalogFacetOption, CatalogFilters } from "./catalog-view";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import type { AvailableCatalogTaxonomy } from "./available-catalog-taxonomy";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { STOREFRONT_CATEGORIES, categoryCodeMatches, storefrontCategoryBySlug } from "./storefront-taxonomy";
import { decodeCatalogSizeGroup, groupCatalogSizeFacets, inferCatalogSizeDomain } from "./catalog-size";

const EMPTY_FACETS = { subcategories: [], brands: [], colors: [], sizes: [] } as const;

type FastTaxonomyRow = Readonly<{
  category_pairs: unknown;
  subcategories: unknown;
  brands: unknown;
  colors: unknown;
  sizes: unknown;
}>;

type AvailableCategoryPair = Readonly<{ categoryCode: string; departmentCode?: string }>;

type FacetRow = Readonly<{ value: string; label: string }>;
type SizeFacetRow = Readonly<{ value: string; count: number }>;

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

function categoryPrefixes(category: string): readonly string[] {
  const normalized = normalizeCategory(category);
  if (!normalized) return [];
  const governed = storefrontCategoryBySlug(normalized);
  return governed ? governed.aliases.map(normalizeCategory) : [normalized];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOptions(value: unknown): readonly CatalogFacetOption[] {
  return arrayValue(value)
    .map(stringValue)
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => ({ value: entry, label: entry }));
}

function facetRows(value: unknown): readonly FacetRow[] {
  return arrayValue(value).flatMap((entry) => {
    const record = recordValue(entry);
    const option = stringValue(record.value);
    if (!option) return [];
    return [{ value: option, label: stringValue(record.label) ?? option }];
  });
}

function sizeFacetRows(value: unknown): readonly SizeFacetRow[] {
  return arrayValue(value).flatMap((entry) => {
    const record = recordValue(entry);
    const option = stringValue(record.value);
    const count = Number(record.count);
    if (!option || !Number.isFinite(count) || count <= 0) return [];
    return [{ value: option, count }];
  });
}

function availableCategoryPairs(value: unknown): readonly AvailableCategoryPair[] {
  return arrayValue(value).flatMap((entry) => {
    const record = recordValue(entry);
    const categoryCode = stringValue(record.categoryCode);
    if (!categoryCode) return [];
    return [{
      categoryCode,
      departmentCode: stringValue(record.departmentCode)
    }];
  });
}

function fallbackTaxonomy(): AvailableCatalogTaxonomy {
  return {
    categories: STOREFRONT_CATEGORIES,
    facets: EMPTY_FACETS,
    attributeFacets: []
  };
}

/**
 * Standard /shop taxonomy from the narrow storefront facet read model.
 * The governed top-level category registry is static application vocabulary, so
 * requests no longer rescan the catalogue just to rediscover those categories.
 */
export async function getFastShopTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  _postcode = "23100",
  _attributeFilters: CatalogAttributeFilters = {}
): Promise<AvailableCatalogTaxonomy> {
  if (!productionDatabaseConfigured()) return fallbackTaxonomy();

  // The default /shop browse must not block product rendering on a catalogue-wide
  // DISTINCT/JSON facet aggregation. Detailed facets are useful only after the
  // customer introduces taxonomy/search context; the top-level category vocabulary
  // is governed application data and can be returned immediately.
  const hasFacetContext = Boolean(
    category.trim()
      || query.trim()
      || filters.subcategory?.trim()
      || filters.brand?.trim()
      || filters.color?.trim()
      || filters.size?.trim()
  );
  if (!hasFacetContext) return fallbackTaxonomy();

  const prefixes = categoryPrefixes(category);
  const search = query.trim();
  const selectedSizes = decodeCatalogSizeGroup(filters.size ?? "");
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<FastTaxonomyRow>(`
      WITH RECURSIVE category_tree AS (
        SELECT c.id,c.parent_id,c.code,c.code AS department_code
        FROM public.categories c
        JOIN public.markets m ON m.id=c.market_id
        WHERE m.code='sparta' AND c.parent_id IS NULL

        UNION ALL

        SELECT child.id,child.parent_id,child.code,parent.department_code
        FROM public.categories child
        JOIN category_tree parent ON child.parent_id=parent.id
      ), stable AS MATERIALIZED (
        SELECT
          rm.canonical_variant_id,
          rm.category_code,
          rm.category_label,
          rm.department_code,
          NULLIF(BTRIM(COALESCE(rm.brand_name,'')),'') AS brand,
          NULLIF(BTRIM(COALESCE(rm.color,'')),'') AS color,
          rm.sizes,
          rm.search_vector,
          rm.gtin,
          rm.mpn
        FROM public.storefront_facet_read_model rm
        WHERE rm.available_until>now()
      ), hot_symphonya AS MATERIALIZED (
        SELECT DISTINCT ON (cv.id)
          cv.id AS canonical_variant_id,
          c.code AS category_code,
          COALESCE(ctel.name,cten.name,c.code) AS category_label,
          tree.department_code,
          NULLIF(BTRIM(COALESCE(b.name,pfb.name,'')),'') AS brand,
          NULLIF(BTRIM(COALESCE(
            el.specifications->>'color',
            en.specifications->>'color',
            cv.variant_attributes->>'color',
            ''
          )),'') AS color,
          COALESCE(
            el.specifications->'sizes',
            en.specifications->'sizes',
            cv.variant_attributes->'sizes_observed',
            '[]'::jsonb
          ) AS sizes,
          to_tsvector(
            'simple',
            concat_ws(
              ' ',
              COALESCE(el.title,en.title,cv.model,cv.slug),
              COALESCE(b.name,pfb.name,''),
              COALESCE(cv.gtin,''),
              COALESCE(cv.mpn,''),
              c.code,
              tree.department_code
            )
          ) AS search_vector,
          cv.gtin,
          cv.mpn
        FROM public.dropship_supplier_offers dso
        JOIN public.dropship_suppliers ds
          ON ds.id=dso.supplier_id
         AND ds.code='symphonya'
         AND ds.active=true
         AND ds.api_authoritative_availability=true
        JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN public.categories c ON c.id=cv.category_id
        JOIN category_tree tree ON tree.id=cv.category_id
        JOIN public.vendor_businesses v ON v.id=vo.vendor_id
        JOIN public.vendor_locations l ON l.id=vo.location_id
        LEFT JOIN public.product_families pf ON pf.id=cv.family_id
        LEFT JOIN public.brands b ON b.id=cv.brand_id
        LEFT JOIN public.brands pfb ON pfb.id=pf.brand_id
        LEFT JOIN public.product_translations el
          ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN public.product_translations en
          ON en.canonical_variant_id=cv.id AND en.locale='en'
        LEFT JOIN public.category_translations ctel
          ON ctel.category_id=c.id AND ctel.locale='el'
        LEFT JOIN public.category_translations cten
          ON cten.category_id=c.id AND cten.locale='en'
        WHERE false -- Emergency stability: request-time storefront reads must use the precomputed projection only.
          AND dso.active=true
          AND dso.cached_available=true
          AND COALESCE(dso.cached_quantity,0)>=1
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND v.status='active'
          AND l.active=true
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
          AND NOT EXISTS (
            SELECT 1 FROM stable projected WHERE projected.canonical_variant_id=cv.id
          )
        ORDER BY cv.id,dso.availability_checked_at DESC NULLS LAST,vo.updated_at DESC,vo.id
      ), combined AS MATERIALIZED (
        SELECT canonical_variant_id,category_code,category_label,department_code,brand,color,sizes,search_vector,gtin,mpn
        FROM stable
        UNION ALL
        SELECT canonical_variant_id,category_code,category_label,department_code,brand,color,sizes,search_vector,gtin,mpn
        FROM hot_symphonya
      ), base AS MATERIALIZED (
        SELECT category_code,category_label,department_code,brand,color,sizes
        FROM combined
        WHERE (
            cardinality($1::text[])=0 OR EXISTS (
              SELECT 1 FROM unnest($1::text[]) prefix
              WHERE lower(category_code)=prefix
                 OR lower(category_code) LIKE prefix||'-%'
                 OR lower(department_code)=prefix
                 OR lower(department_code) LIKE prefix||'-%'
            )
          )
          AND (
            $2::text='' OR
            search_vector @@ plainto_tsquery('simple',$2)
            OR COALESCE(gtin,'')=$2
            OR lower(COALESCE(mpn,''))=lower($2)
          )
      ), subcategory_values AS (
        SELECT DISTINCT category_code AS value,category_label AS label
        FROM base
        WHERE ($4::text='' OR lower(COALESCE(brand,''))=lower($4))
          AND ($5::text='' OR lower(COALESCE(color,''))=lower($5))
          AND (cardinality($6::text[])=0 OR EXISTS (
            SELECT 1 FROM unnest($6::text[]) selected_size(value)
            WHERE COALESCE(sizes,'[]'::jsonb) ? selected_size.value
          ))
      ), brand_values AS (
        SELECT DISTINCT brand AS value
        FROM base
        WHERE brand IS NOT NULL
          AND ($3::text='' OR category_code=$3)
          AND ($5::text='' OR lower(COALESCE(color,''))=lower($5))
          AND (cardinality($6::text[])=0 OR EXISTS (
            SELECT 1 FROM unnest($6::text[]) selected_size(value)
            WHERE COALESCE(sizes,'[]'::jsonb) ? selected_size.value
          ))
      ), color_values AS (
        SELECT DISTINCT color AS value
        FROM base
        WHERE color IS NOT NULL
          AND ($3::text='' OR category_code=$3)
          AND ($4::text='' OR lower(COALESCE(brand,''))=lower($4))
          AND (cardinality($6::text[])=0 OR EXISTS (
            SELECT 1 FROM unnest($6::text[]) selected_size(value)
            WHERE COALESCE(sizes,'[]'::jsonb) ? selected_size.value
          ))
      ), size_values AS (
        SELECT size_entry.value,COUNT(*)::int AS count
        FROM base
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(base.sizes,'[]'::jsonb)) AS size_entry(value)
        WHERE ($3::text='' OR category_code=$3)
          AND ($4::text='' OR lower(COALESCE(brand,''))=lower($4))
          AND ($5::text='' OR lower(COALESCE(color,''))=lower($5))
        GROUP BY size_entry.value
      )
      SELECT
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'categoryCode',category_code,
            'departmentCode',department_code
          ) ORDER BY category_code,department_code)
          FROM (SELECT DISTINCT category_code,department_code FROM combined) category_pairs
        ),'[]'::jsonb) AS category_pairs,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('value',value,'label',label) ORDER BY label,value)
          FROM subcategory_values
        ),'[]'::jsonb) AS subcategories,
        COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM brand_values),'[]'::jsonb) AS brands,
        COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM color_values),'[]'::jsonb) AS colors,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'count',count) ORDER BY value) FROM size_values),'[]'::jsonb) AS sizes
    `, [
      prefixes,
      search,
      filters.subcategory ?? "",
      filters.brand ?? "",
      filters.color ?? "",
      selectedSizes
    ]);

    const row = result.rows[0];
    if (!row) return fallbackTaxonomy();
    const subcategories = facetRows(row.subcategories);
    const selectedSubcategory = filters.subcategory
      ? subcategories.find((entry) => entry.value === filters.subcategory)
      : undefined;
    const sizeContext = filters.subcategory
      ? [filters.subcategory, selectedSubcategory?.label ?? ""]
      : [category, ...subcategories.flatMap((entry) => [entry.value, entry.label])];
    const sizeDomain = inferCatalogSizeDomain(sizeContext);
    const sizes = groupCatalogSizeFacets(sizeFacetRows(row.sizes), sizeDomain)
      .map((entry) => ({ value: entry.value, label: entry.label }));

    const categoryPairs = availableCategoryPairs(row.category_pairs);
    const categories = STOREFRONT_CATEGORIES.filter((category) =>
      categoryPairs.some((pair) => categoryCodeMatches(pair.categoryCode, category.slug, pair.departmentCode))
    );

    return {
      categories,
      facets: {
        subcategories,
        brands: textOptions(row.brands),
        colors: textOptions(row.colors),
        sizes
      },
      attributeFacets: []
    };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.fast_taxonomy_degraded",
      message: error instanceof Error ? error.message : String(error)
    }));
    return fallbackTaxonomy();
  }
}

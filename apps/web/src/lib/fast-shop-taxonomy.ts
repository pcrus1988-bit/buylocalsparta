import type { CatalogFacetOption, CatalogFilters } from "./catalog-view";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import type { AvailableCatalogTaxonomy } from "./available-catalog-taxonomy";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { categoryCodeMatches, STOREFRONT_CATEGORIES, storefrontCategoryBySlug } from "./storefront-taxonomy";

const EMPTY_FACETS = { subcategories: [], brands: [], colors: [], sizes: [] } as const;

type FastTaxonomyRow = Readonly<{
  category_rows: unknown;
  subcategories: unknown;
  brands: unknown;
  colors: unknown;
  sizes: unknown;
}>;

type CategoryRow = Readonly<{ code: string; departmentCode?: string }>;

type FacetRow = Readonly<{ value: string; label: string }>;

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

function categoryRows(value: unknown): readonly CategoryRow[] {
  return arrayValue(value).flatMap((entry) => {
    const record = recordValue(entry);
    const code = stringValue(record.code);
    if (!code) return [];
    return [{ code, departmentCode: stringValue(record.departmentCode) }];
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
 * Fast standard taxonomy for /shop.
 *
 * The former discovery taxonomy hydrated every public canonical, loaded department
 * codes for the whole catalogue, then loaded metadata for the whole scoped set in
 * Node. That cost grows linearly with supplier catalogue size and eventually made
 * the shop fail while rebuilding the facet cache.
 *
 * This projection keeps the work in PostgreSQL and returns only distinct category,
 * brand, colour and size vocabulary. It intentionally does not build governed
 * leaf-specific attribute facets; callers that require those still use the richer
 * taxonomy path.
 */
export async function getFastShopTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  _postcode = "23100",
  _attributeFilters: CatalogAttributeFilters = {}
): Promise<AvailableCatalogTaxonomy> {
  if (!productionDatabaseConfigured()) return fallbackTaxonomy();

  const prefixes = categoryPrefixes(category);
  const search = query.trim();
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<FastTaxonomyRow>(`
      WITH RECURSIVE category_tree AS (
        SELECT c.id,c.parent_id,c.code,c.code AS department_code
        FROM categories c
        JOIN markets m ON m.id=c.market_id
        WHERE m.code='sparta' AND c.parent_id IS NULL
        UNION ALL
        SELECT child.id,child.parent_id,child.code,parent.department_code
        FROM categories child
        JOIN category_tree parent ON child.parent_id=parent.id
      ), search_matches AS MATERIALIZED (
        SELECT canonical_variant_id
        FROM storefront_search_documents
        WHERE $2::text<>''
          AND document @@ plainto_tsquery('simple',$2)
      ), all_categories AS MATERIALIZED (
        SELECT DISTINCT c.code,tree.department_code
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN categories c ON c.id=cv.category_id
        JOIN category_tree tree ON tree.id=cv.category_id
        WHERE m.code='sparta'
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
      ), base AS MATERIALIZED (
        SELECT
          c.code AS category_code,
          tree.department_code,
          COALESCE(ctel.name,cten.name,c.code) AS category_label,
          NULLIF(BTRIM(COALESCE(b.name,'')),'') AS brand,
          NULLIF(BTRIM(COALESCE(
            el.specifications->>'color',
            en.specifications->>'color',
            cv.variant_attributes->>'color',
            ''
          )),'') AS color,
          CASE
            WHEN jsonb_typeof(COALESCE(
              el.specifications->'sizes',
              en.specifications->'sizes',
              cv.variant_attributes->'sizes_observed',
              '[]'::jsonb
            ))='array'
              THEN COALESCE(
                el.specifications->'sizes',
                en.specifications->'sizes',
                cv.variant_attributes->'sizes_observed',
                '[]'::jsonb
              )
            ELSE '[]'::jsonb
          END AS sizes
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN categories c ON c.id=cv.category_id
        JOIN category_tree tree ON tree.id=cv.category_id
        LEFT JOIN product_families pf ON pf.id=cv.family_id
        LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
        LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
        WHERE m.code='sparta'
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND (
            cardinality($1::text[])=0 OR EXISTS (
              SELECT 1 FROM unnest($1::text[]) prefix
              WHERE lower(c.code)=prefix
                 OR lower(c.code) LIKE prefix||'-%'
                 OR lower(tree.department_code)=prefix
                 OR lower(tree.department_code) LIKE prefix||'-%'
            )
          )
          AND (
            $2::text='' OR
            cv.id IN (SELECT canonical_variant_id FROM search_matches)
            OR COALESCE(cv.gtin,'')=$2
            OR lower(COALESCE(cv.mpn,''))=lower($2)
          )
      ), subcategory_values AS (
        SELECT DISTINCT category_code AS value,category_label AS label
        FROM base
        WHERE ($4::text='' OR lower(COALESCE(brand,''))=lower($4))
          AND ($5::text='' OR lower(COALESCE(color,''))=lower($5))
          AND ($6::text='' OR sizes ? $6)
      ), brand_values AS (
        SELECT DISTINCT brand AS value
        FROM base
        WHERE brand IS NOT NULL
          AND ($3::text='' OR category_code=$3)
          AND ($5::text='' OR lower(COALESCE(color,''))=lower($5))
          AND ($6::text='' OR sizes ? $6)
      ), color_values AS (
        SELECT DISTINCT color AS value
        FROM base
        WHERE color IS NOT NULL
          AND ($3::text='' OR category_code=$3)
          AND ($4::text='' OR lower(COALESCE(brand,''))=lower($4))
          AND ($6::text='' OR sizes ? $6)
      ), size_values AS (
        SELECT DISTINCT size_entry.value
        FROM base
        CROSS JOIN LATERAL jsonb_array_elements_text(base.sizes) AS size_entry(value)
        WHERE ($3::text='' OR category_code=$3)
          AND ($4::text='' OR lower(COALESCE(brand,''))=lower($4))
          AND ($5::text='' OR lower(COALESCE(color,''))=lower($5))
      )
      SELECT
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('code',code,'departmentCode',department_code) ORDER BY code)
          FROM all_categories
        ),'[]'::jsonb) AS category_rows,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('value',value,'label',label) ORDER BY label,value)
          FROM subcategory_values
        ),'[]'::jsonb) AS subcategories,
        COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM brand_values),'[]'::jsonb) AS brands,
        COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM color_values),'[]'::jsonb) AS colors,
        COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM size_values),'[]'::jsonb) AS sizes
    `, [
      prefixes,
      search,
      filters.subcategory ?? "",
      filters.brand ?? "",
      filters.color ?? "",
      filters.size ?? ""
    ]);

    const row = result.rows[0];
    if (!row) return fallbackTaxonomy();
    const activeCategoryRows = categoryRows(row.category_rows);
    const categories = STOREFRONT_CATEGORIES.filter((entry) =>
      activeCategoryRows.some((candidate) => categoryCodeMatches(candidate.code, entry.slug, candidate.departmentCode))
    );

    return {
      categories: categories.length ? categories : STOREFRONT_CATEGORIES,
      facets: {
        subcategories: facetRows(row.subcategories),
        brands: textOptions(row.brands),
        colors: textOptions(row.colors),
        sizes: textOptions(row.sizes)
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

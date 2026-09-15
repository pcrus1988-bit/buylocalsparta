import type { CatalogFilters } from "./catalog-view";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import {
  catalogAttributeDefinitionsForLeaf,
  type CatalogAttributeFacet
} from "./catalog-attribute-facets";
import type { AvailableCatalogTaxonomy } from "./available-catalog-taxonomy";
import { getFastShopTaxonomy } from "./fast-shop-taxonomy";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { storefrontCategoryBySlug } from "./storefront-taxonomy";

type AttributeFacetRow = Readonly<{ attribute_facets: unknown }>;
type AttributeFacetJson = Readonly<{ key?: unknown; label?: unknown; options?: unknown }>;

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

function categoryPrefixes(category: string): readonly string[] {
  const normalized = normalizeCategory(category);
  if (!normalized) return [];
  const governed = storefrontCategoryBySlug(normalized);
  return governed ? governed.aliases.map(normalizeCategory) : [normalized];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseAttributeFacets(value: unknown): readonly CatalogAttributeFacet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as AttributeFacetJson;
    const key = stringValue(row.key);
    const label = stringValue(row.label);
    if (!key || !label || !Array.isArray(row.options)) return [];
    const options = row.options
      .map(stringValue)
      .filter((option): option is string => Boolean(option))
      .map((option) => ({ value: option, label: option }));
    return options.length ? [{ key, label, options }] : [];
  });
}

/** Governed leaf-specific facets from the JSON-bearing background projection. */
async function loadFastAttributeFacets(
  category: string,
  query: string,
  filters: CatalogFilters,
  leafKey: string,
  attributeFilters: CatalogAttributeFilters
): Promise<readonly CatalogAttributeFacet[]> {
  if (!productionDatabaseConfigured()) return [];
  const definitions = catalogAttributeDefinitionsForLeaf(leafKey);
  if (!definitions.length) return [];

  const prefixes = categoryPrefixes(category);
  const definitionPayload = definitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    sourceKeys: definition.sourceKeys
  }));

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<AttributeFacetRow>(`
      WITH definitions AS MATERIALIZED (
        SELECT
          item->>'key' AS key,
          item->>'label' AS label,
          COALESCE(item->'sourceKeys','[]'::jsonb) AS source_keys
        FROM jsonb_array_elements($7::jsonb) item
      ), raw AS MATERIALIZED (
        SELECT
          rm.category_code,
          NULLIF(BTRIM(COALESCE(rm.brand_name,'')),'') AS brand,
          NULLIF(BTRIM(COALESCE(rm.color,'')),'') AS color,
          rm.sizes,
          rm.raw_attributes
        FROM public.storefront_filter_read_model rm
        WHERE rm.available_until>now()
          AND (
            cardinality($1::text[])=0 OR EXISTS (
              SELECT 1 FROM unnest($1::text[]) prefix
              WHERE lower(rm.category_code)=prefix
                 OR lower(rm.category_code) LIKE prefix||'-%'
                 OR lower(rm.department_code)=prefix
                 OR lower(rm.department_code) LIKE prefix||'-%'
            )
          )
          AND (
            $2::text='' OR
            rm.search_vector @@ plainto_tsquery('simple',$2)
            OR COALESCE(rm.gtin,'')=$2
            OR lower(COALESCE(rm.mpn,''))=lower($2)
          )
      ), base AS MATERIALIZED (
        SELECT
          raw.*,
          COALESCE((
            SELECT jsonb_object_agg(definition.key, resolved.value)
            FROM definitions definition
            CROSS JOIN LATERAL (
              SELECT NULLIF(BTRIM(raw.raw_attributes->>source_key.value),'') AS value
              FROM jsonb_array_elements_text(definition.source_keys) source_key(value)
              WHERE NULLIF(BTRIM(raw.raw_attributes->>source_key.value),'') IS NOT NULL
              LIMIT 1
            ) resolved
          ),'{}'::jsonb) AS governed_attributes
        FROM raw
      ), attribute_values AS (
        SELECT DISTINCT
          definition.key,
          definition.label,
          base.governed_attributes->>definition.key AS value
        FROM base
        CROSS JOIN definitions definition
        WHERE base.governed_attributes ? definition.key
          AND ($3::text='' OR base.category_code=$3)
          AND ($4::text='' OR lower(COALESCE(base.brand,''))=lower($4))
          AND ($5::text='' OR lower(COALESCE(base.color,''))=lower($5))
          AND ($6::text='' OR base.sizes ? $6)
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_each_text($8::jsonb) selected(key,value)
            WHERE selected.key<>definition.key
              AND lower(COALESCE(base.governed_attributes->>selected.key,''))<>lower(selected.value)
          )
      ), grouped AS (
        SELECT
          key,
          label,
          jsonb_agg(value ORDER BY value) AS options,
          COUNT(*) AS option_count
        FROM attribute_values
        WHERE value IS NOT NULL AND BTRIM(value)<>''
        GROUP BY key,label
      )
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('key',key,'label',label,'options',options)
          ORDER BY key
        ) FILTER (WHERE option_count BETWEEN 1 AND 40),
        '[]'::jsonb
      ) AS attribute_facets
      FROM grouped
    `, [
      prefixes,
      query.trim(),
      filters.subcategory ?? "",
      filters.brand ?? "",
      filters.color ?? "",
      filters.size ?? "",
      JSON.stringify(definitionPayload),
      JSON.stringify(attributeFilters)
    ]);

    return parseAttributeFacets(result.rows[0]?.attribute_facets);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.fast_attribute_taxonomy_degraded",
      message: error instanceof Error ? error.message : String(error)
    }));
    return [];
  }
}

export async function getFastRichShopTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  postcode = "23100",
  leafKey = "",
  attributeFilters: CatalogAttributeFilters = {}
): Promise<AvailableCatalogTaxonomy> {
  const [base, attributeFacets] = await Promise.all([
    getFastShopTaxonomy(category, query, filters, postcode, attributeFilters),
    loadFastAttributeFacets(category, query, filters, leafKey, attributeFilters)
  ]);
  return { ...base, attributeFacets };
}

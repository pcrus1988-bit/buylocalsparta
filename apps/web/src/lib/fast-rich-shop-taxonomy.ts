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

/**
 * Governed leaf-specific facets without hydrating the public catalogue in Node.
 *
 * The former rich taxonomy path called publicCanonicals(), then loaded department
 * codes and metadata for every discoverable canonical. Once the supplier catalogue
 * passed ~50k variants that request path could time out before /shop rendered.
 * This projection keeps the same governed alias registry but resolves values and
 * selected-attribute filtering inside PostgreSQL and returns only the small facet
 * vocabulary needed by the page.
 */
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
      WITH RECURSIVE category_tree AS (
        SELECT c.id,c.parent_id,c.code,c.code AS department_code
        FROM categories c
        JOIN markets m ON m.id=c.market_id
        WHERE m.code='sparta' AND c.parent_id IS NULL
        UNION ALL
        SELECT child.id,child.parent_id,child.code,parent.department_code
        FROM categories child
        JOIN category_tree parent ON child.parent_id=parent.id
      ), definitions AS MATERIALIZED (
        SELECT
          item->>'key' AS key,
          item->>'label' AS label,
          COALESCE(item->'sourceKeys','[]'::jsonb) AS source_keys
        FROM jsonb_array_elements($7::jsonb) item
      ), raw AS MATERIALIZED (
        SELECT
          c.code AS category_code,
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
          END AS sizes,
          COALESCE(cv.variant_attributes,'{}'::jsonb)
            || COALESCE(en.specifications,'{}'::jsonb)
            || COALESCE(el.specifications,'{}'::jsonb) AS raw_attributes
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN categories c ON c.id=cv.category_id
        JOIN category_tree tree ON tree.id=cv.category_id
        LEFT JOIN product_families pf ON pf.id=cv.family_id
        LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
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
            to_tsvector('simple',concat_ws(' ',
              COALESCE(el.title,en.title,cv.model,cv.slug),
              COALESCE(el.description,en.description,''),
              COALESCE(b.name,''),
              COALESCE(cv.gtin,''),
              COALESCE(cv.mpn,''),
              c.code
            )) @@ plainto_tsquery('simple',$2)
            OR COALESCE(cv.gtin,'')=$2
            OR lower(COALESCE(cv.mpn,''))=lower($2)
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

import type { CatalogFacetOption, CatalogFilters } from "./catalog-view";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import type { AvailableCatalogTaxonomy } from "./available-catalog-taxonomy";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { STOREFRONT_CATEGORIES, storefrontCategoryBySlug } from "./storefront-taxonomy";
import { decodeCatalogSizeGroup, groupCatalogSizeFacets, inferCatalogSizeDomain } from "./catalog-size";

const EMPTY_FACETS = { subcategories: [], brands: [], colors: [], sizes: [] } as const;

type FastTaxonomyRow = Readonly<{
  subcategories: unknown;
  brands: unknown;
  colors: unknown;
  sizes: unknown;
  fits: unknown;
}>;

type FacetRow = Readonly<{ value: string; label: string; count?: number }>;
type SizeFacetRow = Readonly<{ value: string; count: number }>;

type ShopTaxonomyFilters = CatalogFilters & Readonly<{ fit?: string }>;

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

function facetRows(value: unknown): readonly FacetRow[] {
  return arrayValue(value).flatMap((entry) => {
    const record = recordValue(entry);
    const option = stringValue(record.value);
    if (!option) return [];
    const parsedCount = Number(record.count);
    return [{
      value: option,
      label: stringValue(record.label) ?? option,
      count: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : undefined
    }];
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

function fallbackTaxonomy(): AvailableCatalogTaxonomy {
  return {
    categories: STOREFRONT_CATEGORIES,
    facets: EMPTY_FACETS,
    fits: [],
    attributeFacets: []
  };
}

/**
 * Fast /shop facet vocabulary.
 *
 * The old path depended exclusively on storefront_facet_read_model and deliberately
 * returned no facets for a plain /shop visit. Once the heavyweight materialized-view
 * refresh was load-shed, its available_until timestamps expired and every rich filter
 * disappeared. Product discovery itself already uses the incremental live-family
 * projection, so facets must use the same source of truth.
 *
 * This query combines the compact dropship live-family table with fresh local pickup
 * inventory. It stays family/variant bounded, is cached by cached-shop-taxonomy, and
 * never rebuilds the supplier catalogue on the request path.
 */
export async function getFastShopTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  _postcode = "23100",
  _attributeFilters: CatalogAttributeFilters = {}
): Promise<AvailableCatalogTaxonomy> {
  if (!productionDatabaseConfigured()) return fallbackTaxonomy();

  const scopedFilters = filters as ShopTaxonomyFilters;
  const prefixes = categoryPrefixes(category);
  const search = query.trim();
  const selectedSizes = decodeCatalogSizeGroup(scopedFilters.size ?? "");
  const selectedFit = scopedFilters.fit?.trim() ?? "";

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
      ), live_dropship AS MATERIALIZED (
        SELECT
          'dropship:'||lf.supplier_id::text||':'||lf.external_product_id AS item_key,
          lf.category_codes,
          lf.department_codes,
          lf.brand_names AS brands,
          lf.colors,
          lf.sizes,
          lf.fits,
          lf.search_vector
        FROM bls_private.storefront_dropship_live_family lf
        WHERE lf.sellable=true
          AND lf.available_until>now()
      ), local_live AS MATERIALIZED (
        SELECT DISTINCT ON (cv.id)
          'local:'||cv.public_id AS item_key,
          ARRAY[c.code]::text[] AS category_codes,
          ARRAY[tree.department_code]::text[] AS department_codes,
          array_remove(ARRAY[
            lower(NULLIF(BTRIM(COALESCE(b.name,pfb.name,'')),''))
          ]::text[],NULL) AS brands,
          array_remove(ARRAY[
            lower(NULLIF(BTRIM(COALESCE(
              el.specifications->>'color',
              en.specifications->>'color',
              cv.variant_attributes->>'color',
              ''
            )),''))
          ]::text[],NULL) AS colors,
          ARRAY(
            SELECT size_value
            FROM jsonb_array_elements_text(
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
              END
            ) size_value
            WHERE BTRIM(size_value)<>''
          )::text[] AS sizes,
          array_remove(ARRAY[
            lower(NULLIF(BTRIM(COALESCE(
              el.specifications->>'fit',
              en.specifications->>'fit',
              cv.variant_attributes->>'fit',
              ''
            )),''))
          ]::text[],NULL) AS fits,
          to_tsvector(
            'simple',
            concat_ws(
              ' ',
              COALESCE(el.title,en.title,cv.model,cv.slug),
              COALESCE(el.description,en.description,''),
              COALESCE(b.name,pfb.name,''),
              COALESCE(cv.gtin,''),
              COALESCE(cv.mpn,''),
              c.code,
              tree.department_code
            )
          ) AS search_vector
        FROM public.inventory_balances ib
        JOIN public.vendor_offers vo ON vo.id=ib.offer_id
        JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN public.categories c ON c.id=cv.category_id
        JOIN category_tree tree ON tree.id=cv.category_id
        JOIN public.vendor_businesses v ON v.id=vo.vendor_id
        JOIN public.vendor_locations l ON l.id=vo.location_id
        LEFT JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        LEFT JOIN public.product_families pf ON pf.id=cv.family_id
        LEFT JOIN public.brands b ON b.id=cv.brand_id
        LEFT JOIN public.brands pfb ON pfb.id=pf.brand_id
        LEFT JOIN public.product_translations el
          ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN public.product_translations en
          ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE dso.id IS NULL
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND v.status='active'
          AND l.active=true
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
          AND ib.stock_confirmed_at IS NOT NULL
          AND ib.stock_confirmed_at+make_interval(secs=>ib.freshness_ttl_seconds)>now()
        ORDER BY cv.id,vo.customer_price_minor ASC,ib.stock_confirmed_at DESC,vo.public_id
      ), combined AS (
        SELECT item_key,category_codes,department_codes,brands,colors,sizes,fits,search_vector
        FROM live_dropship
        UNION ALL
        SELECT item_key,category_codes,department_codes,brands,colors,sizes,fits,search_vector
        FROM local_live
      ), base AS MATERIALIZED (
        SELECT item_key,category_codes,brands,colors,sizes,fits
        FROM combined
        WHERE (
          cardinality($1::text[])=0
          OR EXISTS (
            SELECT 1
            FROM unnest(category_codes) category_code
            CROSS JOIN unnest($1::text[]) prefix
            WHERE lower(category_code)=prefix
               OR lower(category_code) LIKE prefix||'-%'
          )
          OR EXISTS (
            SELECT 1
            FROM unnest(department_codes) department_code
            CROSS JOIN unnest($1::text[]) prefix
            WHERE lower(department_code)=prefix
               OR lower(department_code) LIKE prefix||'-%'
          )
        )
        AND (
          $2::text=''
          OR search_vector @@ plainto_tsquery('simple',$2)
        )
      ), subcategory_values AS (
        SELECT
          category_code AS value,
          COALESCE(MAX(ctel.name),MAX(cten.name),category_code) AS label,
          COUNT(*)::int AS count
        FROM base
        CROSS JOIN LATERAL unnest(base.category_codes) category_entry(category_code)
        LEFT JOIN public.categories c
          ON c.code=category_code
         AND EXISTS (
           SELECT 1 FROM public.markets m
           WHERE m.id=c.market_id AND m.code='sparta'
         )
        LEFT JOIN public.category_translations ctel
          ON ctel.category_id=c.id AND ctel.locale='el'
        LEFT JOIN public.category_translations cten
          ON cten.category_id=c.id AND cten.locale='en'
        WHERE (
            $4::text='' OR base.brands @> ARRAY[lower($4)]::text[]
          )
          AND (
            $5::text='' OR base.colors @> ARRAY[lower($5)]::text[]
          )
          AND (
            cardinality($6::text[])=0 OR EXISTS (
              SELECT 1
              FROM unnest(base.sizes) actual(value)
              CROSS JOIN unnest($6::text[]) selected(value)
              WHERE lower(actual.value)=lower(selected.value)
            )
          )
          AND (
            $7::text='' OR base.fits @> ARRAY[lower($7)]::text[]
          )
        GROUP BY category_code
      ), brand_values AS (
        SELECT
          brand_value AS value,
          COALESCE(MAX(brand_record.name),brand_value) AS label,
          COUNT(*)::int AS count
        FROM base
        CROSS JOIN LATERAL unnest(base.brands) brand_entry(brand_value)
        LEFT JOIN public.brands brand_record
          ON brand_record.normalized_name=brand_value
        WHERE (
            $3::text='' OR base.category_codes @> ARRAY[$3]::text[]
          )
          AND (
            $5::text='' OR base.colors @> ARRAY[lower($5)]::text[]
          )
          AND (
            cardinality($6::text[])=0 OR EXISTS (
              SELECT 1
              FROM unnest(base.sizes) actual(value)
              CROSS JOIN unnest($6::text[]) selected(value)
              WHERE lower(actual.value)=lower(selected.value)
            )
          )
          AND (
            $7::text='' OR base.fits @> ARRAY[lower($7)]::text[]
          )
        GROUP BY brand_value
      ), color_values AS (
        SELECT
          color_value AS value,
          color_value AS label,
          COUNT(*)::int AS count
        FROM base
        CROSS JOIN LATERAL unnest(base.colors) color_entry(color_value)
        WHERE (
            $3::text='' OR base.category_codes @> ARRAY[$3]::text[]
          )
          AND (
            $4::text='' OR base.brands @> ARRAY[lower($4)]::text[]
          )
          AND (
            cardinality($6::text[])=0 OR EXISTS (
              SELECT 1
              FROM unnest(base.sizes) actual(value)
              CROSS JOIN unnest($6::text[]) selected(value)
              WHERE lower(actual.value)=lower(selected.value)
            )
          )
          AND (
            $7::text='' OR base.fits @> ARRAY[lower($7)]::text[]
          )
        GROUP BY color_value
      ), size_values AS (
        SELECT
          size_value AS value,
          COUNT(*)::int AS count
        FROM base
        CROSS JOIN LATERAL unnest(base.sizes) size_entry(size_value)
        WHERE (
            $3::text='' OR base.category_codes @> ARRAY[$3]::text[]
          )
          AND (
            $4::text='' OR base.brands @> ARRAY[lower($4)]::text[]
          )
          AND (
            $5::text='' OR base.colors @> ARRAY[lower($5)]::text[]
          )
          AND (
            $7::text='' OR base.fits @> ARRAY[lower($7)]::text[]
          )
        GROUP BY size_value
      ), fit_values AS (
        SELECT
          fit_value AS value,
          fit_value AS label,
          COUNT(*)::int AS count
        FROM base
        CROSS JOIN LATERAL unnest(base.fits) fit_entry(fit_value)
        WHERE (
            $3::text='' OR base.category_codes @> ARRAY[$3]::text[]
          )
          AND (
            $4::text='' OR base.brands @> ARRAY[lower($4)]::text[]
          )
          AND (
            $5::text='' OR base.colors @> ARRAY[lower($5)]::text[]
          )
          AND (
            cardinality($6::text[])=0 OR EXISTS (
              SELECT 1
              FROM unnest(base.sizes) actual(value)
              CROSS JOIN unnest($6::text[]) selected(value)
              WHERE lower(actual.value)=lower(selected.value)
            )
          )
        GROUP BY fit_value
      )
      SELECT
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('value',value,'label',label,'count',count)
            ORDER BY label,value
          )
          FROM subcategory_values
        ),'[]'::jsonb) AS subcategories,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('value',value,'label',label,'count',count)
            ORDER BY count DESC,label,value
          )
          FROM brand_values
        ),'[]'::jsonb) AS brands,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('value',value,'label',label,'count',count)
            ORDER BY count DESC,label,value
          )
          FROM color_values
        ),'[]'::jsonb) AS colors,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('value',value,'count',count)
            ORDER BY value
          )
          FROM size_values
        ),'[]'::jsonb) AS sizes,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('value',value,'label',label,'count',count)
            ORDER BY count DESC,label,value
          )
          FROM fit_values
        ),'[]'::jsonb) AS fits
    `, [
      prefixes,
      search,
      scopedFilters.subcategory ?? "",
      scopedFilters.brand ?? "",
      scopedFilters.color ?? "",
      selectedSizes,
      selectedFit
    ]);

    const row = result.rows[0];
    if (!row) return fallbackTaxonomy();

    const subcategories = facetRows(row.subcategories);
    const selectedSubcategory = scopedFilters.subcategory
      ? subcategories.find((entry) => entry.value === scopedFilters.subcategory)
      : undefined;
    const sizeContext = scopedFilters.subcategory
      ? [scopedFilters.subcategory, selectedSubcategory?.label ?? ""]
      : [category, ...subcategories.flatMap((entry) => [entry.value, entry.label])];
    const sizeDomain = inferCatalogSizeDomain(sizeContext);
    const sizes = groupCatalogSizeFacets(sizeFacetRows(row.sizes), sizeDomain)
      .map((entry) => ({ value: entry.value, label: entry.label, count: entry.count }));

    return {
      categories: STOREFRONT_CATEGORIES,
      facets: {
        subcategories,
        brands: facetRows(row.brands),
        colors: facetRows(row.colors),
        sizes
      },
      fits: facetRows(row.fits),
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

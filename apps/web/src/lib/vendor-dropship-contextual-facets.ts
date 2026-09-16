import { groupCatalogSizeFacets, inferCatalogSizeDomain } from "./catalog-size";
import type { VendorDropshipFacets, VendorDropshipFacetOption } from "./vendor-dropship-catalog-page";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorDropshipFacetContext = Readonly<{
  query?: string;
  categories?: readonly string[];
  brand?: string;
  color?: string;
  sizes?: readonly string[];
}>;

type FacetProjectionRow = Readonly<{
  facet_type: "total" | "category" | "brand" | "color" | "size";
  value: string;
  label: string;
  count: number | string;
}>;

function safeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function prefixTsQuery(value: string): string {
  return value
    .toLocaleLowerCase("el")
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((token) => `${token}:*`)
    .join(" & ");
}

function cleanMany(values: readonly string[] | undefined, max = 120, limit = 64): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim().slice(0, max)).filter(Boolean))].slice(0, limit);
}

/**
 * Calculates disjunctive, context-aware facets from the same family read model as
 * the vendor catalogue itself. Each facet ignores only its own active value, so
 * changing brand/size/color does not make the selected facet disappear while all
 * other counts stay representative of the products the customer can actually see.
 */
export async function getContextualVendorDropshipFacets(
  vendorId: string,
  input: VendorDropshipFacetContext = {}
): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) return { total: 0, categories: [], brands: [], colors: [], sizes: [] };

  const query = input.query?.trim().slice(0, 160) ?? "";
  const categories = cleanMany(input.categories);
  const brand = input.brand?.trim().slice(0, 160) ?? "";
  const color = input.color?.trim().slice(0, 120) ?? "";
  const sizes = cleanMany(input.sizes);
  const searchPrefix = prefixTsQuery(query);

  const result = await getProductionPostgresRuntime().nativePool.query<FacetProjectionRow>(`
    WITH supplier AS MATERIALIZED (
      SELECT ds.id::text AS supplier_id
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
      LIMIT 1
    ), base AS MATERIALIZED (
      SELECT fm.*
      FROM public.storefront_dropship_family_filter_read_model fm
      JOIN supplier s ON s.supplier_id=fm.dropship_supplier_id
      WHERE fm.available_until>now()
        AND (
          $2::text='' OR
          ($7::text<>'' AND fm.search_vector @@ to_tsquery('simple',$7))
        )
    ), label_map AS MATERIALIZED (
      SELECT facets.facet_type,facets.value,facets.label
      FROM public.storefront_dropship_vendor_facets facets
      JOIN supplier s ON s.supplier_id=facets.supplier_id
      WHERE facets.facet_type IN ('category','brand','color')
    ), projected AS (
      SELECT
        'total'::text AS facet_type,
        ''::text AS value,
        ''::text AS label,
        COUNT(DISTINCT b.dropship_external_product_id)::int AS count
      FROM base b
      WHERE (cardinality($3::text[])=0 OR b.category_codes && $3::text[])
        AND ($4::text='' OR b.brand_names_normalized @> ARRAY[lower($4)]::text[])
        AND ($5::text='' OR EXISTS (SELECT 1 FROM unnest(b.colors) candidate(value) WHERE lower(candidate.value)=lower($5)))
        AND (cardinality($6::text[])=0 OR b.sizes && $6::text[])

      UNION ALL

      SELECT
        'category'::text,
        candidate.value,
        COALESCE(MAX(labels.label),candidate.value),
        COUNT(DISTINCT b.dropship_external_product_id)::int
      FROM base b
      CROSS JOIN LATERAL unnest(b.category_codes) candidate(value)
      LEFT JOIN label_map labels ON labels.facet_type='category' AND labels.value=candidate.value
      WHERE ($4::text='' OR b.brand_names_normalized @> ARRAY[lower($4)]::text[])
        AND ($5::text='' OR EXISTS (SELECT 1 FROM unnest(b.colors) color_candidate(value) WHERE lower(color_candidate.value)=lower($5)))
        AND (cardinality($6::text[])=0 OR b.sizes && $6::text[])
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'brand'::text,
        candidate.value,
        COALESCE(MAX(labels.label),candidate.value),
        COUNT(DISTINCT b.dropship_external_product_id)::int
      FROM base b
      CROSS JOIN LATERAL unnest(b.brand_names_normalized) candidate(value)
      LEFT JOIN label_map labels ON labels.facet_type='brand' AND lower(labels.value)=candidate.value
      WHERE (cardinality($3::text[])=0 OR b.category_codes && $3::text[])
        AND ($5::text='' OR EXISTS (SELECT 1 FROM unnest(b.colors) color_candidate(value) WHERE lower(color_candidate.value)=lower($5)))
        AND (cardinality($6::text[])=0 OR b.sizes && $6::text[])
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'color'::text,
        candidate.value,
        COALESCE(MAX(labels.label),candidate.value),
        COUNT(DISTINCT b.dropship_external_product_id)::int
      FROM base b
      CROSS JOIN LATERAL unnest(b.colors) candidate(value)
      LEFT JOIN label_map labels ON labels.facet_type='color' AND lower(labels.value)=lower(candidate.value)
      WHERE (cardinality($3::text[])=0 OR b.category_codes && $3::text[])
        AND ($4::text='' OR b.brand_names_normalized @> ARRAY[lower($4)]::text[])
        AND (cardinality($6::text[])=0 OR b.sizes && $6::text[])
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'size'::text,
        candidate.value,
        candidate.value,
        COUNT(DISTINCT b.dropship_external_product_id)::int
      FROM base b
      CROSS JOIN LATERAL unnest(b.sizes) candidate(value)
      WHERE (cardinality($3::text[])=0 OR b.category_codes && $3::text[])
        AND ($4::text='' OR b.brand_names_normalized @> ARRAY[lower($4)]::text[])
        AND ($5::text='' OR EXISTS (SELECT 1 FROM unnest(b.colors) color_candidate(value) WHERE lower(color_candidate.value)=lower($5)))
      GROUP BY candidate.value
    )
    SELECT facet_type,value,label,count
    FROM projected
    WHERE facet_type='total' OR count>0
    ORDER BY facet_type,label,value
  `, [vendorId, query, categories, brand, color, sizes, searchPrefix]);

  let total = 0;
  const categoriesOut: VendorDropshipFacetOption[] = [];
  const brands: VendorDropshipFacetOption[] = [];
  const colors: VendorDropshipFacetOption[] = [];
  const rawSizes: Array<{ value: string; count: number }> = [];

  for (const row of result.rows) {
    const count = safeCount(row.count);
    if (row.facet_type === "total") {
      total = count;
      continue;
    }
    if (!row.value.trim() || count <= 0) continue;
    const entry = { value: row.value, label: row.label || row.value, count };
    if (row.facet_type === "category") categoriesOut.push(entry);
    else if (row.facet_type === "brand") brands.push(entry);
    else if (row.facet_type === "color") colors.push(entry);
    else rawSizes.push({ value: row.value, count });
  }

  const sizeDomain = inferCatalogSizeDomain(categories);
  const canonicalSizes = groupCatalogSizeFacets(rawSizes, sizeDomain);

  return {
    total,
    categories: categoriesOut.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el")),
    brands: brands.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el")),
    colors: colors.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el")),
    sizes: canonicalSizes
  };
}

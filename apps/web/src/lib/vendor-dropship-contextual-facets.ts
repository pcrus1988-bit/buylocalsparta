import { groupCatalogSizeFacets, inferCatalogSizeDomain } from "./catalog-size";
import type { VendorDropshipFacets, VendorDropshipFacetOption } from "./vendor-dropship-catalog-page";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorDropshipFacetContext = Readonly<{
  query?: string;
  categories?: readonly string[];
  brand?: string;
  color?: string;
  sizes?: readonly string[];
  fit?: string;
  material?: string;
}>;

type FacetType = "total" | "category" | "brand" | "color" | "size" | "fit" | "material";

type FacetProjectionRow = Readonly<{
  facet_type: FacetType;
  value: string;
  label: string;
  count: number | string;
}>;

const COLOR_LABELS: Readonly<Record<string, string>> = {
  black: "Μαύρο",
  white: "Λευκό",
  "off white": "Εκρού",
  ivory: "Ιβουάρ",
  beige: "Μπεζ",
  cream: "Κρεμ",
  blue: "Μπλε",
  "light blue": "Γαλάζιο",
  "dark blue": "Σκούρο μπλε",
  navy: "Navy",
  red: "Κόκκινο",
  green: "Πράσινο",
  khaki: "Χακί",
  brown: "Καφέ",
  camel: "Camel",
  grey: "Γκρι",
  gray: "Γκρι",
  silver: "Ασημί",
  gold: "Χρυσό",
  pink: "Ροζ",
  purple: "Μωβ",
  violet: "Βιολετί",
  yellow: "Κίτρινο",
  orange: "Πορτοκαλί",
  burgundy: "Μπορντό",
  bordeaux: "Μπορντό",
  multicolor: "Πολύχρωμο"
};

const FIT_LABELS: Readonly<Record<string, string>> = {
  slim: "Slim",
  regular: "Κανονική γραμμή",
  relaxed: "Άνετη γραμμή",
  oversized: "Oversized",
  skinny: "Skinny",
  straight: "Ίσια γραμμή",
  loose: "Χαλαρή γραμμή",
  tapered: "Tapered"
};

const MATERIAL_LABELS: Readonly<Record<string, string>> = {
  cotton: "Βαμβάκι",
  wool: "Μαλλί",
  cashmere: "Κασμίρ",
  silk: "Μετάξι",
  linen: "Λινό",
  polyester: "Πολυεστέρας",
  viscose: "Βισκόζη",
  rayon: "Rayon",
  acrylic: "Ακρυλικό",
  polyamide: "Πολυαμίδιο",
  nylon: "Nylon",
  elastane: "Ελαστάνη",
  leather: "Δέρμα",
  suede: "Καστόρι",
  denim: "Denim",
  modal: "Modal",
  lyocell: "Lyocell / Tencel",
  acetate: "Acetate",
  polyurethane: "Πολυουρεθάνη",
  rubber: "Καουτσούκ"
};

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

function localizedFacetLabel(type: FacetType, value: string, fallback: string): string {
  const normalized = value.trim().toLocaleLowerCase("en");
  if (type === "color") return COLOR_LABELS[normalized] ?? (fallback || value);
  if (type === "fit") return FIT_LABELS[normalized] ?? (fallback || value);
  if (type === "material") return MATERIAL_LABELS[normalized] ?? (fallback || value);
  return fallback || value;
}

/**
 * Calculates disjunctive, context-aware facets from the same family read model as
 * the vendor catalogue itself. Each facet ignores only its own active value, so
 * changing one dimension does not make that selected dimension disappear.
 */
export async function getContextualVendorDropshipFacets(
  vendorId: string,
  input: VendorDropshipFacetContext = {}
): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) {
    return { total: 0, categories: [], brands: [], colors: [], sizes: [], fits: [], materials: [] };
  }

  const query = input.query?.trim().slice(0, 160) ?? "";
  const categories = cleanMany(input.categories);
  const brand = input.brand?.trim().slice(0, 160) ?? "";
  const color = input.color?.trim().slice(0, 120) ?? "";
  const sizes = cleanMany(input.sizes);
  const fit = input.fit?.trim().slice(0, 120).toLocaleLowerCase("en") ?? "";
  const material = input.material?.trim().slice(0, 120).toLocaleLowerCase("en") ?? "";
  const searchPrefix = prefixTsQuery(query);

  const result = await getProductionPostgresRuntime().nativePool.query<FacetProjectionRow>(`
    WITH suppliers AS MATERIALIZED (
      SELECT ds.id::text AS supplier_id
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
    ), base AS MATERIALIZED (
      SELECT fm.*
      FROM public.storefront_dropship_family_filter_read_model_v2 fm
      JOIN suppliers s ON s.supplier_id=fm.dropship_supplier_id
      WHERE fm.available_until>now()
        AND (
          $2::text='' OR
          ($9::text<>'' AND fm.search_vector @@ to_tsquery('simple',$9))
        )
    ), label_map AS MATERIALIZED (
      SELECT DISTINCT facets.facet_type,facets.value,facets.label
      FROM public.storefront_dropship_vendor_facets facets
      JOIN suppliers s ON s.supplier_id=facets.supplier_id
      WHERE facets.facet_type IN ('category','brand','color')
    ), matches AS MATERIALIZED (
      SELECT
        b.*,
        (cardinality($3::text[])=0 OR b.category_codes && $3::text[]) AS category_match,
        ($4::text='' OR b.brand_names_normalized @> ARRAY[lower($4)]::text[]) AS brand_match,
        ($5::text='' OR EXISTS (SELECT 1 FROM unnest(b.colors) candidate(value) WHERE lower(candidate.value)=lower($5))) AS color_match,
        (cardinality($6::text[])=0 OR b.sizes && $6::text[]) AS size_match,
        ($7::text='' OR EXISTS (SELECT 1 FROM unnest(b.fits) candidate(value) WHERE lower(candidate.value)=lower($7))) AS fit_match,
        ($8::text='' OR b.materials @> ARRAY[lower($8)]::text[]) AS material_match
      FROM base b
    ), projected AS (
      SELECT
        'total'::text AS facet_type,
        ''::text AS value,
        ''::text AS label,
        COUNT(DISTINCT (m.dropship_supplier_id,m.dropship_external_product_id))::int AS count
      FROM matches m
      WHERE m.category_match AND m.brand_match AND m.color_match AND m.size_match AND m.fit_match AND m.material_match

      UNION ALL

      SELECT
        'category'::text,
        candidate.value,
        COALESCE(MAX(labels.label),candidate.value),
        COUNT(DISTINCT (m.dropship_supplier_id,m.dropship_external_product_id))::int
      FROM matches m
      CROSS JOIN LATERAL unnest(m.category_codes) candidate(value)
      LEFT JOIN label_map labels ON labels.facet_type='category' AND labels.value=candidate.value
      WHERE m.brand_match AND m.color_match AND m.size_match AND m.fit_match AND m.material_match
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'brand'::text,
        candidate.value,
        COALESCE(MAX(labels.label),candidate.value),
        COUNT(DISTINCT (m.dropship_supplier_id,m.dropship_external_product_id))::int
      FROM matches m
      CROSS JOIN LATERAL unnest(m.brand_names_normalized) candidate(value)
      LEFT JOIN label_map labels ON labels.facet_type='brand' AND lower(labels.value)=candidate.value
      WHERE m.category_match AND m.color_match AND m.size_match AND m.fit_match AND m.material_match
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'color'::text,
        candidate.value,
        COALESCE(MAX(labels.label),candidate.value),
        COUNT(DISTINCT (m.dropship_supplier_id,m.dropship_external_product_id))::int
      FROM matches m
      CROSS JOIN LATERAL unnest(m.colors) candidate(value)
      LEFT JOIN label_map labels ON labels.facet_type='color' AND lower(labels.value)=lower(candidate.value)
      WHERE m.category_match AND m.brand_match AND m.size_match AND m.fit_match AND m.material_match
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'size'::text,
        candidate.value,
        candidate.value,
        COUNT(DISTINCT (m.dropship_supplier_id,m.dropship_external_product_id))::int
      FROM matches m
      CROSS JOIN LATERAL unnest(m.sizes) candidate(value)
      WHERE m.category_match AND m.brand_match AND m.color_match AND m.fit_match AND m.material_match
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'fit'::text,
        candidate.value,
        candidate.value,
        COUNT(DISTINCT (m.dropship_supplier_id,m.dropship_external_product_id))::int
      FROM matches m
      CROSS JOIN LATERAL unnest(m.fits) candidate(value)
      WHERE m.category_match AND m.brand_match AND m.color_match AND m.size_match AND m.material_match
      GROUP BY candidate.value

      UNION ALL

      SELECT
        'material'::text,
        candidate.value,
        candidate.value,
        COUNT(DISTINCT (m.dropship_supplier_id,m.dropship_external_product_id))::int
      FROM matches m
      CROSS JOIN LATERAL unnest(m.materials) candidate(value)
      WHERE m.category_match AND m.brand_match AND m.color_match AND m.size_match AND m.fit_match
      GROUP BY candidate.value
    )
    SELECT facet_type,value,label,count
    FROM projected
    WHERE facet_type='total' OR count>0
    ORDER BY facet_type,label,value
  `, [vendorId, query, categories, brand, color, sizes, fit, material, searchPrefix]);

  let total = 0;
  const categoriesOut: VendorDropshipFacetOption[] = [];
  const brands: VendorDropshipFacetOption[] = [];
  const colors: VendorDropshipFacetOption[] = [];
  const rawSizes: Array<{ value: string; count: number }> = [];
  const fits: VendorDropshipFacetOption[] = [];
  const materials: VendorDropshipFacetOption[] = [];

  for (const row of result.rows) {
    const count = safeCount(row.count);
    if (row.facet_type === "total") {
      total = count;
      continue;
    }
    if (!row.value.trim() || count <= 0) continue;
    const entry = {
      value: row.value,
      label: localizedFacetLabel(row.facet_type, row.value, row.label || row.value),
      count
    };
    if (row.facet_type === "category") categoriesOut.push(entry);
    else if (row.facet_type === "brand") brands.push(entry);
    else if (row.facet_type === "color") colors.push(entry);
    else if (row.facet_type === "fit") fits.push(entry);
    else if (row.facet_type === "material") materials.push(entry);
    else rawSizes.push({ value: row.value, count });
  }

  const sizeDomain = inferCatalogSizeDomain(categories);
  const canonicalSizes = groupCatalogSizeFacets(rawSizes, sizeDomain);
  const byPopularity = (left: VendorDropshipFacetOption, right: VendorDropshipFacetOption) =>
    right.count - left.count || left.label.localeCompare(right.label, "el");

  return {
    total,
    categories: categoriesOut.sort(byPopularity),
    brands: brands.sort(byPopularity),
    colors: colors.sort(byPopularity),
    sizes: canonicalSizes,
    fits: fits.sort(byPopularity),
    materials: materials.sort(byPopularity)
  };
}

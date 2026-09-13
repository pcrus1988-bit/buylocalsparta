import { unstable_cache } from "next/cache";
import type { VendorDropshipFacets, VendorDropshipFacetOption } from "./vendor-dropship-catalog-page";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type HiddenCategoryRow = Readonly<{ id: string }>;
type FacetRow = Readonly<{ total: number | string; categories: unknown; brands: unknown; colors: unknown }>;
type SizeRow = Readonly<{ value: string }>;

function safeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function facetOptions(value: unknown): readonly VendorDropshipFacetOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const option = text(row.value);
    if (!option) return [];
    return [{ value: option, label: text(row.label) ?? option, count: safeInt(row.count) }];
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
      SELECT child.id FROM categories child JOIN hidden parent ON child.parent_id=parent.id
    )
    SELECT id::text AS id FROM hidden
  `, [vendorId]);
  return result.rows.map((row) => row.id);
}

async function readFastVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) return { total: 0, categories: [], brands: [], colors: [], sizes: [] };
  const hiddenCategoryIds = await hiddenVendorCategoryIds(vendorId);
  const pool = getProductionPostgresRuntime().nativePool;

  // Keep the expensive dynamic-size vocabulary isolated from family-count facets.
  // Each query completes within the production statement timeout on the 50k+ NOVA
  // catalogue, while combining both workloads into one CTE exceeds that budget.
  const [facetResult, sizeResult] = await Promise.all([
    pool.query<FacetRow>(`
      WITH base AS MATERIALIZED (
        SELECT
          COALESCE(cv.family_id::text,dso.supplier_id::text||':'||dso.external_product_id) AS family_key,
          c.code AS category_code,
          COALESCE(ctel.name,cten.name,c.code) AS category_label,
          NULLIF(BTRIM(COALESCE(b.name,'')),'') AS brand,
          NULLIF(BTRIM(COALESCE(
            el.specifications->>'color',en.specifications->>'color',cv.variant_attributes->>'color',''
          )),'') AS color
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
          AND vo.status='approved' AND vo.merchant_visible=true AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND v.status='active' AND l.active=true
          AND dso.active=true AND ds.active=true AND ds.api_authoritative_availability=true
          AND (cardinality($2::uuid[])=0 OR NOT (cv.category_id=ANY($2::uuid[])))
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      ), category_values AS (
        SELECT category_code AS value,MIN(category_label) AS label,COUNT(DISTINCT family_key)::int AS count
        FROM base GROUP BY category_code
      ), brand_values AS (
        SELECT brand AS value,COUNT(DISTINCT family_key)::int AS count
        FROM base WHERE brand IS NOT NULL GROUP BY brand
      ), color_values AS (
        SELECT color AS value,COUNT(DISTINCT family_key)::int AS count
        FROM base WHERE color IS NOT NULL GROUP BY color
      )
      SELECT
        (SELECT COUNT(DISTINCT family_key)::int FROM base) AS total,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'label',label,'count',count) ORDER BY label,value) FROM category_values),'[]'::jsonb) AS categories,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'label',value,'count',count) ORDER BY value) FROM brand_values),'[]'::jsonb) AS brands,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('value',value,'label',value,'count',count) ORDER BY value) FROM color_values),'[]'::jsonb) AS colors
    `, [vendorId, hiddenCategoryIds]),
    pool.query<SizeRow>(`
      SELECT DISTINCT BTRIM(size_entry.value) AS value
      FROM vendor_offers vo
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN vendor_locations l ON l.id=vo.location_id
      CROSS JOIN LATERAL unnest(ARRAY[
        cv.variant_attributes->>'italian_size_men',
        cv.variant_attributes->>'italian_size_women',
        cv.variant_attributes->>'shoe_size_women',
        cv.variant_attributes->>'shoe_size_men',
        cv.variant_attributes->>'waist_size',
        cv.variant_attributes->>'belt_size',
        cv.variant_attributes->>'waist_length_size',
        cv.variant_attributes->>'hat_size',
        cv.variant_attributes->>'swimwear_sleepwear_size',
        cv.variant_attributes->>'shoe_size',
        cv.variant_attributes->>'earrings_size',
        cv.variant_attributes->>'bracelets_size',
        cv.variant_attributes->>'gloves_size_women',
        cv.variant_attributes->>'ring_size',
        cv.variant_attributes->>'gloves_size_men',
        cv.variant_attributes->>'size'
      ]) AS size_entry(value)
      WHERE v.public_id=$1
        AND m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND vo.status='approved' AND vo.merchant_visible=true AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active' AND l.active=true
        AND dso.active=true AND ds.active=true AND ds.api_authoritative_availability=true
        AND (cardinality($2::uuid[])=0 OR NOT (cv.category_id=ANY($2::uuid[])))
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND size_entry.value IS NOT NULL AND BTRIM(size_entry.value)<>''
      ORDER BY value
      LIMIT 500
    `, [vendorId, hiddenCategoryIds])
  ]);

  const row = facetResult.rows[0];
  return {
    total: safeInt(row?.total),
    categories: facetOptions(row?.categories),
    brands: facetOptions(row?.brands),
    colors: facetOptions(row?.colors),
    sizes: sizeResult.rows.map((entry) => ({ value: entry.value, label: entry.value, count: 0 }))
  };
}

const cachedFastVendorDropshipFacets = unstable_cache(
  readFastVendorDropshipFacets,
  ["vendor-dropship-storefront-fast-facets-v1"],
  { revalidate: 300 }
);

export function getFastVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  return cachedFastVendorDropshipFacets(vendorId);
}

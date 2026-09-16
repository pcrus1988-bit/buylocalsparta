import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type StorefrontReadModelFilters = Readonly<{
  subcategory?: string;
  subcategories?: readonly string[];
  brand?: string;
  color?: string;
  size?: string;
  fit?: string;
}>;

export type StorefrontReadModelWindowInput = Readonly<{
  prefixes?: readonly string[];
  query?: string;
  filters?: StorefrontReadModelFilters;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort?: string;
  limit: number;
  offset: number;
}>;

export type StorefrontReadModelCandidate = Readonly<{
  canonical_public_id: string;
  department_code: string | null;
  total_count: number | string;
}>;

export type StorefrontDropshipFamilyCandidate = Readonly<{
  supplier_id: string;
  external_product_id: string;
  total_families: number | string;
}>;

export type StorefrontSearchCandidate = Readonly<{
  id: string;
  routeKey: string;
  title: string;
  brand?: string;
  categoryLabel?: string;
  available: boolean;
  score: number;
}>;

function parameters(input: StorefrontReadModelWindowInput): unknown[] {
  const filters = input.filters ?? {};
  const subcategories = filters.subcategory?.trim()
    ? [filters.subcategory.trim()]
    : [...new Set((filters.subcategories ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 64);
  return [
    [...(input.prefixes ?? [])],
    subcategories,
    filters.brand ?? "",
    filters.color ?? "",
    filters.size ?? "",
    filters.fit ?? "",
    input.query?.trim() ?? "",
    input.minPriceMinor ?? null,
    input.maxPriceMinor ?? null,
    input.sort ?? "",
    input.limit,
    input.offset
  ];
}

const FILTER_SQL = `
  AND (
    cardinality($1::text[])=0 OR EXISTS (
      SELECT 1 FROM unnest($1::text[]) prefix
      WHERE lower(rm.category_code)=prefix
         OR lower(rm.category_code) LIKE prefix||'-%'
         OR lower(rm.department_code)=prefix
         OR lower(rm.department_code) LIKE prefix||'-%'
    )
  )
  AND (cardinality($2::text[])=0 OR rm.category_code=ANY($2::text[]))
  AND ($3::text='' OR lower(COALESCE(rm.brand_name,''))=lower($3))
  AND ($4::text='' OR rm.color=lower($4))
  AND ($5::text='' OR rm.sizes ? $5)
  AND ($6::text='' OR rm.fit=lower($6))
  AND (
    $7::text='' OR
    rm.search_vector @@ plainto_tsquery('simple',$7)
    OR lower(rm.title || ' ' || COALESCE(rm.brand_name,'')) LIKE '%'||lower($7)||'%'
    OR COALESCE(rm.gtin,'')=$7
    OR lower(COALESCE(rm.mpn,''))=lower($7)
  )
  AND ($8::bigint IS NULL OR rm.min_price_minor >= $8)
  AND ($9::bigint IS NULL OR rm.min_price_minor <= $9)
`;

const FAMILY_FILTER_SQL = `
  AND (
    cardinality($1::text[])=0 OR EXISTS (
      SELECT 1
      FROM unnest(fm.category_codes) code
      CROSS JOIN unnest($1::text[]) prefix
      WHERE lower(code)=prefix OR lower(code) LIKE prefix||'-%'
    ) OR EXISTS (
      SELECT 1
      FROM unnest(fm.department_codes) code
      CROSS JOIN unnest($1::text[]) prefix
      WHERE lower(code)=prefix OR lower(code) LIKE prefix||'-%'
    )
  )
  AND (cardinality($2::text[])=0 OR fm.category_codes && $2::text[])
  AND ($3::text='' OR fm.brand_names @> ARRAY[lower($3)]::text[])
  AND ($4::text='' OR fm.colors @> ARRAY[lower($4)]::text[])
  AND ($5::text='' OR lower(COALESCE(fm.sizes_text,'')) LIKE '%"'||lower($5)||'"%')
  AND ($6::text='' OR fm.fits @> ARRAY[lower($6)]::text[])
  AND ($7::text='' OR fm.search_vector @@ plainto_tsquery('simple',$7))
  AND ($8::bigint IS NULL OR fm.min_price_minor >= $8)
  AND ($9::bigint IS NULL OR fm.max_price_minor <= $9)
`;

/**
 * Candidate discovery only. Personalized vendor assignment deliberately happens
 * after this function has reduced the catalogue to a small page-sized window.
 */
export async function getLocalStorefrontReadModelWindow(
  input: StorefrontReadModelWindowInput
): Promise<readonly StorefrontReadModelCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query<StorefrontReadModelCandidate>(`
    SELECT
      rm.canonical_public_id,
      rm.department_code,
      COUNT(*) OVER() AS total_count
    FROM public.storefront_catalog_read_model rm
    WHERE rm.local_sellable=true
      AND rm.local_available_until>now()
      ${FILTER_SQL}
    ORDER BY
      CASE WHEN $10::text='price-asc' THEN rm.min_price_minor END ASC,
      CASE WHEN $10::text='price-desc' THEN rm.min_price_minor END DESC,
      CASE WHEN $10::text NOT IN ('price-asc','price-desc') THEN rm.created_at END DESC,
      rm.canonical_public_id
    LIMIT $11 OFFSET $12
  `, parameters(input));
  return result.rows;
}

function dropshipSort(sort?: string): string {
  if (sort === "price-asc") return "fm.min_price_minor ASC,fm.dropship_supplier_id,fm.dropship_external_product_id";
  if (sort === "price-desc") return "fm.min_price_minor DESC,fm.dropship_supplier_id,fm.dropship_external_product_id";
  return "fm.newest_at DESC,fm.dropship_supplier_id,fm.dropship_external_product_id";
}

/**
 * Dropship discovery reads one narrow row per supplier product family. The normal
 * no-filter browse path can use the precomputed total and a top-N btree lookup;
 * filtered paths scan only the compact family projection, never the 65k offers.
 */
export async function getDropshipStorefrontReadModelWindow(
  input: StorefrontReadModelWindowInput
): Promise<readonly StorefrontDropshipFamilyCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  const pool = getProductionPostgresRuntime().nativePool;
  const filters = input.filters ?? {};
  const cleanQuery = input.query?.trim() ?? "";
  const hasFilters = Boolean(
    input.prefixes?.length || filters.subcategory || filters.subcategories?.length || filters.brand || filters.color ||
    filters.size || filters.fit || cleanQuery || input.minPriceMinor !== undefined ||
    input.maxPriceMinor !== undefined
  );
  const orderBy = dropshipSort(input.sort);

  if (!hasFilters) {
    const result = await pool.query<StorefrontDropshipFamilyCandidate>(`
      SELECT
        fm.dropship_supplier_id AS supplier_id,
        fm.dropship_external_product_id AS external_product_id,
        fm.total_families
      FROM public.storefront_dropship_family_read_model fm
      WHERE fm.available_until>now()
      ORDER BY ${orderBy}
      LIMIT $1 OFFSET $2
    `, [input.limit, input.offset]);
    return result.rows;
  }

  const familyFilterParameters = [
    ...parameters(input).slice(0, 9),
    input.limit,
    input.offset
  ];
  const result = await pool.query<StorefrontDropshipFamilyCandidate>(`
    SELECT
      fm.dropship_supplier_id AS supplier_id,
      fm.dropship_external_product_id AS external_product_id,
      COUNT(*) OVER() AS total_families
    FROM public.storefront_dropship_family_read_model fm
    WHERE fm.available_until>now()
      ${FAMILY_FILTER_SQL}
    ORDER BY ${orderBy}
    LIMIT $10 OFFSET $11
  `, familyFilterParameters);
  return result.rows;
}

/** Fast autocomplete fallback when the dedicated search service is disabled. */
export async function getStorefrontReadModelSearchCandidates(
  query: string,
  limit = 24
): Promise<readonly StorefrontSearchCandidate[]> {
  if (!productionDatabaseConfigured()) return [];
  const clean = query.trim().slice(0, 120);
  if (clean.length < 2) return [];
  const boundedLimit = Math.max(1, Math.min(40, limit));
  const result = await getProductionPostgresRuntime().nativePool.query<{
    canonical_public_id: string;
    slug: string;
    title: string;
    brand_name: string | null;
    category_code: string;
    department_code: string | null;
    rank: number | string;
  }>(`
    SELECT
      rm.canonical_public_id,
      rm.slug,
      rm.title,
      rm.brand_name,
      rm.category_code,
      rm.department_code,
      GREATEST(
        similarity(lower(rm.title || ' ' || COALESCE(rm.brand_name,'')),lower($1)),
        ts_rank_cd(rm.search_vector,plainto_tsquery('simple',$1))
      ) AS rank
    FROM public.storefront_catalog_read_model rm
    WHERE (
        (rm.local_sellable=true AND rm.local_available_until>now())
        OR (rm.dropship_sellable=true AND rm.dropship_available_until>now())
      )
      AND (
        rm.search_vector @@ plainto_tsquery('simple',$1)
        OR lower(rm.title || ' ' || COALESCE(rm.brand_name,'')) LIKE '%'||lower($1)||'%'
        OR COALESCE(rm.gtin,'')=$1
        OR lower(COALESCE(rm.mpn,''))=lower($1)
      )
    ORDER BY rank DESC,rm.created_at DESC,rm.canonical_public_id
    LIMIT $2
  `, [clean, boundedLimit]);
  return result.rows.map((row) => ({
    id: row.canonical_public_id,
    routeKey: row.slug || row.canonical_public_id,
    title: row.title,
    brand: row.brand_name?.trim() || undefined,
    categoryLabel: row.department_code || row.category_code,
    available: true,
    score: Number(row.rank) || 0
  }));
}
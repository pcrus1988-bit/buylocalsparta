import { formatMoney, money } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { getPublicCatalogSourcePrimaryImages } from "./public-catalog-source-gallery";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_PAGE_SIZE = 36;
const MAX_PAGE_SIZE = 60;
const LIVE_FALLBACK_FAMILY_CAP = 0; // Production storefronts must not rebuild missing supplier families inside a customer request.
const LIVE_DEGRADED_FALLBACK_SEED_CAP = 2_000; // Bounded indexed recovery used only when the projection returns no matches.

export type VendorDropshipSort = "recommended" | "price_asc" | "price_desc" | "name_asc";

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
  fits: readonly VendorDropshipFacetOption[];
  materials: readonly VendorDropshipFacetOption[];
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
  categories?: readonly string[];
  brand?: string;
  color?: string;
  size?: string;
  sizes?: readonly string[];
  fit?: string;
  material?: string;
  sort?: VendorDropshipSort;
  availableOnly?: boolean;
  offset?: number;
  limit?: number;
}>;

type FamilySelectionRow = Readonly<{
  supplier_id: string;
  external_product_id: string;
  total_families: number | string;
}>;

type PageRow = Readonly<{
  canonical_public_id: string;
  family_id: string | null;
  supplier_id: string;
  external_product_id: string;
  offer_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  department_code: string | null;
  customer_price_minor: number | string;
  msrp_minor: number | string | null;
  cached_quantity: number | string | null;
  vendor_public_id: string;
  vendor_name: string;
  vendor_presentation: unknown;
}>;

type FacetProjectionRow = Readonly<{
  facet_type: "total" | "category" | "brand" | "color" | "size";
  value: string;
  label: string;
  count: number | string;
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

function categoryValues(input: VendorDropshipCatalogPageInput): readonly string[] {
  if (input.category?.trim()) return [input.category.trim().slice(0, 120)];
  return [...new Set((input.categories ?? []).map((value) => value.trim().slice(0, 120)).filter(Boolean))].slice(0, 64);
}

function sizeValues(input: VendorDropshipCatalogPageInput): readonly string[] {
  if (input.size?.trim()) return [input.size.trim().slice(0, 120)];
  return [...new Set((input.sizes ?? []).map((value) => value.trim().slice(0, 120)).filter(Boolean))].slice(0, 64);
}

function normalizedSort(value: VendorDropshipSort | undefined): VendorDropshipSort {
  return value === "price_asc" || value === "price_desc" || value === "name_asc" ? value : "recommended";
}

function familyOrder(sort: VendorDropshipSort): string {
  if (sort === "price_asc") return "fm.min_price_minor ASC NULLS LAST,fm.newest_at DESC,fm.dropship_supplier_id,fm.dropship_external_product_id";
  if (sort === "price_desc") return "fm.min_price_minor DESC NULLS LAST,fm.newest_at DESC,fm.dropship_supplier_id,fm.dropship_external_product_id";
  if (sort === "name_asc") return "lower(fm.sort_title) ASC NULLS LAST,fm.dropship_supplier_id,fm.dropship_external_product_id";
  return "fm.newest_at DESC,fm.dropship_supplier_id,fm.dropship_external_product_id";
}


async function getLiveVendorFamilyWindow(input: Readonly<{
  vendorId: string;
  query: string;
  categories: readonly string[];
  brand: string;
  color: string;
  sizes: readonly string[];
  fit: string;
  material: string;
  searchPrefix: string;
  sort: VendorDropshipSort;
  offset: number;
  limit: number;
}>) {
  const pool = getProductionPostgresRuntime().nativePool;
  const orderBy = familyOrder(input.sort);
  return pool.query<FamilySelectionRow>(`
    WITH vendor_suppliers AS MATERIALIZED (
      SELECT ds.id
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
        AND ds.api_authoritative_availability=true
    ), live_seed AS MATERIALIZED (
      SELECT
        supplier.id AS supplier_id,
        candidate.external_product_id,
        candidate.vendor_offer_id,
        candidate.availability_expires_at
      FROM vendor_suppliers supplier
      JOIN LATERAL (
        SELECT
          dso.external_product_id,
          dso.vendor_offer_id,
          dso.availability_expires_at
        FROM dropship_supplier_offers dso
        JOIN vendor_offers seed_vo ON seed_vo.id=dso.vendor_offer_id
        JOIN canonical_variants seed_cv ON seed_cv.id=seed_vo.canonical_variant_id
        JOIN categories seed_category ON seed_category.id=seed_cv.category_id
        JOIN vendor_locations seed_location ON seed_location.id=seed_vo.location_id
        WHERE dso.supplier_id=supplier.id
          AND dso.active=true
          AND dso.cached_available=true
          AND COALESCE(dso.cached_quantity,0)>=1
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
          AND seed_vo.status='approved'
          AND seed_vo.merchant_visible=true
          AND seed_vo.merchant_pause_active=false
          AND seed_vo.customer_price_minor>0
          AND (seed_vo.cost_ceiling_minor IS NULL OR seed_vo.supplier_unit_price_minor<=seed_vo.cost_ceiling_minor)
          AND seed_location.active=true
          AND COALESCE(seed_cv.commerce_channel,'normal')='normal'
          AND seed_cv.active=true
          AND seed_cv.suppressed=false
          AND seed_cv.recalled=false
          AND bls_private.vendor_category_effectively_visible(seed_vo.vendor_id,seed_cv.category_id)
          AND (cardinality($3::text[])=0 OR seed_category.code=ANY($3::text[]))
        ORDER BY dso.updated_at DESC,dso.id DESC
        LIMIT $12
      ) candidate ON true
    ), families AS MATERIALIZED (
      SELECT
        seed.supplier_id::text AS dropship_supplier_id,
        seed.external_product_id AS dropship_external_product_id,
        MAX(seed.availability_expires_at) AS available_until,
        MAX(vo.updated_at) AS newest_at,
        MIN(vo.customer_price_minor) AS min_price_minor,
        COALESCE(array_agg(DISTINCT c.code) FILTER (WHERE c.code IS NOT NULL),'{}'::text[]) AS category_codes,
        COALESCE(array_agg(DISTINCT lower(COALESCE(b.name,pfb.name,'')))
          FILTER (WHERE COALESCE(b.name,pfb.name,'')<>''),'{}'::text[]) AS brand_names_normalized,
        COALESCE(array_agg(DISTINCT NULLIF(BTRIM(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )),'')) FILTER (WHERE NULLIF(BTRIM(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )), '') IS NOT NULL),'{}'::text[]) AS colors,
        COALESCE(array_agg(DISTINCT NULLIF(BTRIM(size_entry.value),''))
          FILTER (WHERE NULLIF(BTRIM(size_entry.value),'') IS NOT NULL),'{}'::text[]) AS sizes,
        COALESCE(array_agg(DISTINCT lower(NULLIF(BTRIM(COALESCE(
          el.specifications->>'fit',
          en.specifications->>'fit',
          ''
        )),''))) FILTER (WHERE NULLIF(BTRIM(COALESCE(
          el.specifications->>'fit',
          en.specifications->>'fit',
          ''
        )), '') IS NOT NULL),'{}'::text[]) AS fits,
        '{}'::text[] AS materials,
        MIN(COALESCE(el.title,en.title,cv.model,cv.slug)) AS sort_title,
        to_tsvector('simple',COALESCE(string_agg(DISTINCT concat_ws(' ',
          COALESCE(el.title,en.title,cv.model,cv.slug),
          COALESCE(b.name,pfb.name,''),
          COALESCE(cv.gtin,''),
          COALESCE(cv.mpn,''),
          c.code
        ),' '),'')) AS search_vector
      FROM live_seed seed
      JOIN vendor_offers vo ON vo.id=seed.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN brands pfb ON pfb.id=pf.brand_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN LATERAL unnest(ARRAY[
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
      ]) AS size_entry(value) ON true
      GROUP BY seed.supplier_id,seed.external_product_id
    )
    SELECT
      fm.dropship_supplier_id AS supplier_id,
      fm.dropship_external_product_id AS external_product_id,
      COUNT(*) OVER()::int AS total_families
    FROM families fm
    WHERE fm.available_until>now()
      AND (cardinality($3::text[])=0 OR fm.category_codes && $3::text[])
      AND ($4::text='' OR fm.brand_names_normalized @> ARRAY[lower($4)]::text[])
      AND ($5::text='' OR EXISTS (
        SELECT 1 FROM unnest(fm.colors) candidate(value)
        WHERE lower(candidate.value)=lower($5)
      ))
      AND (cardinality($6::text[])=0 OR fm.sizes && $6::text[])
      AND ($7::text='' OR EXISTS (
        SELECT 1 FROM unnest(fm.fits) candidate(value)
        WHERE lower(candidate.value)=lower($7)
      ))
      AND ($8::text='' OR fm.materials @> ARRAY[lower($8)]::text[])
      AND (
        $2::text='' OR
        ($9::text<>'' AND fm.search_vector @@ to_tsquery('simple',$9))
      )
    ORDER BY ${orderBy}
    LIMIT $10 OFFSET $11
  `, [
    input.vendorId,
    input.query,
    input.categories,
    input.brand,
    input.color,
    input.sizes,
    input.fit,
    input.material,
    input.searchPrefix,
    input.limit,
    input.offset,
    LIVE_DEGRADED_FALLBACK_SEED_CAP
  ]);
}

/**
 * Filtered vendor catalogue discovery is family-first. The read model narrows the
 * catalogue to a page of supplier product identities; only those identities are
 * joined back to authoritative offer/availability/visibility state.
 */
export async function getVendorDropshipCatalogPage(
  vendorId: string,
  input: VendorDropshipCatalogPageInput = {}
): Promise<VendorDropshipCatalogPage> {
  if (!productionDatabaseConfigured()) return { products: [], total: 0, offset: 0, limit: DEFAULT_PAGE_SIZE };

  const query = input.query?.trim().slice(0, 160) ?? "";
  const categories = categoryValues(input);
  const brand = input.brand?.trim().slice(0, 160) ?? "";
  const color = input.color?.trim().slice(0, 120) ?? "";
  const sizes = sizeValues(input);
  const fit = input.fit?.trim().slice(0, 120).toLocaleLowerCase("en") ?? "";
  const material = input.material?.trim().slice(0, 120).toLocaleLowerCase("en") ?? "";
  const sort = normalizedSort(input.sort);
  const offset = safePositiveInt(input.offset, 0, 100_000);
  const limit = Math.max(1, safePositiveInt(input.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const searchPrefix = prefixTsQuery(query);
  const runtime = getProductionPostgresRuntime();

  let familyWindow = await runtime.nativePool.query<FamilySelectionRow>(`
    WITH vendor_suppliers AS MATERIALIZED (
      SELECT ds.id,ds.id::text AS supplier_id,ds.code
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
        AND ds.api_authoritative_availability=true
    ), stable AS MATERIALIZED (
      SELECT fm.*
      FROM public.storefront_dropship_family_filter_read_model_v2 fm
      JOIN vendor_suppliers supplier ON supplier.supplier_id=fm.dropship_supplier_id
      WHERE fm.available_until>now()
        AND (
          supplier.code<>'symphonya'
          OR EXISTS (
            SELECT 1
            FROM dropship_supplier_offers live_dso
            JOIN vendor_offers live_vo ON live_vo.id=live_dso.vendor_offer_id
            JOIN canonical_variants live_cv ON live_cv.id=live_vo.canonical_variant_id
            JOIN vendor_locations live_location ON live_location.id=live_vo.location_id
            WHERE live_dso.supplier_id=supplier.id
              AND live_dso.external_product_id=fm.dropship_external_product_id
              AND live_dso.active=true
              AND live_dso.cached_available=true
              AND COALESCE(live_dso.cached_quantity,0)>=1
              AND live_dso.availability_expires_at IS NOT NULL
              AND live_dso.availability_expires_at>now()
              AND live_vo.status='approved'
              AND live_vo.merchant_visible=true
              AND live_vo.merchant_pause_active=false
              AND live_vo.customer_price_minor>0
              AND (live_vo.cost_ceiling_minor IS NULL OR live_vo.supplier_unit_price_minor<=live_vo.cost_ceiling_minor)
              AND live_location.active=true
              AND COALESCE(live_cv.commerce_channel,'normal')='normal'
              AND live_cv.active=true
              AND live_cv.suppressed=false
              AND live_cv.recalled=false
              AND bls_private.vendor_category_effectively_visible(live_vo.vendor_id,live_cv.category_id)
          )
        )
    ), live_fallback AS MATERIALIZED (
      SELECT
        dso.supplier_id::text AS dropship_supplier_id,
        dso.external_product_id AS dropship_external_product_id,
        MAX(dso.availability_expires_at) AS available_until,
        MAX(vo.updated_at) AS newest_at,
        MIN(vo.customer_price_minor) AS min_price_minor,
        COALESCE(array_agg(DISTINCT c.code) FILTER (WHERE c.code IS NOT NULL),'{}'::text[]) AS category_codes,
        COALESCE(array_agg(DISTINCT lower(COALESCE(b.name,pfb.name,'')))
          FILTER (WHERE COALESCE(b.name,pfb.name,'')<>''),'{}'::text[]) AS brand_names_normalized,
        COALESCE(array_agg(DISTINCT NULLIF(BTRIM(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )),'')) FILTER (WHERE NULLIF(BTRIM(COALESCE(
          el.specifications->>'color',
          en.specifications->>'color',
          cv.variant_attributes->>'color',
          ''
        )), '') IS NOT NULL),'{}'::text[]) AS colors,
        COALESCE(array_agg(DISTINCT NULLIF(BTRIM(size_entry.value),''))
          FILTER (WHERE NULLIF(BTRIM(size_entry.value),'') IS NOT NULL),'{}'::text[]) AS sizes,
        COALESCE(array_agg(DISTINCT lower(NULLIF(BTRIM(COALESCE(
          el.specifications->>'fit',
          en.specifications->>'fit',
          ''
        )),''))) FILTER (WHERE NULLIF(BTRIM(COALESCE(
          el.specifications->>'fit',
          en.specifications->>'fit',
          ''
        )), '') IS NOT NULL),'{}'::text[]) AS fits,
        '{}'::text[] AS materials,
        MIN(COALESCE(el.title,en.title,cv.model,cv.slug)) AS sort_title,
        to_tsvector('simple',COALESCE(string_agg(DISTINCT concat_ws(' ',
          COALESCE(el.title,en.title,cv.model,cv.slug),
          COALESCE(b.name,pfb.name,''),
          COALESCE(cv.gtin,''),
          COALESCE(cv.mpn,''),
          c.code
        ),' '),'')) AS search_vector
      FROM dropship_supplier_offers dso
      JOIN vendor_suppliers supplier
        ON supplier.id=dso.supplier_id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN brands pfb ON pfb.id=pf.brand_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN LATERAL unnest(ARRAY[
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
      ]) AS size_entry(value) ON true
      WHERE dso.active=true
        AND dso.cached_available=true
        AND COALESCE(dso.cached_quantity,0)>=1
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND l.active=true
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (cardinality($3::text[])=0 OR c.code=ANY($3::text[]))
        AND NOT EXISTS (
          SELECT 1
          FROM public.storefront_dropship_family_filter_read_model_v2 projected
          WHERE projected.dropship_supplier_id=dso.supplier_id::text
            AND projected.dropship_external_product_id=dso.external_product_id
            AND projected.available_until>now()
        )
      GROUP BY dso.supplier_id,dso.external_product_id
      ORDER BY MAX(vo.updated_at) DESC,dso.supplier_id,dso.external_product_id
      LIMIT $12
    ), family_candidates AS (
      SELECT
        dropship_supplier_id,dropship_external_product_id,available_until,newest_at,min_price_minor,
        category_codes,brand_names_normalized,colors,sizes,fits,materials,sort_title,search_vector
      FROM stable
      UNION ALL
      SELECT
        dropship_supplier_id,dropship_external_product_id,available_until,newest_at,min_price_minor,
        category_codes,brand_names_normalized,colors,sizes,fits,materials,sort_title,search_vector
      FROM live_fallback
    )
    SELECT
      fm.dropship_supplier_id AS supplier_id,
      fm.dropship_external_product_id AS external_product_id,
      COUNT(*) OVER()::int AS total_families
    FROM family_candidates fm
    WHERE fm.available_until>now()
      AND (cardinality($3::text[])=0 OR fm.category_codes && $3::text[])
      AND ($4::text='' OR fm.brand_names_normalized @> ARRAY[lower($4)]::text[])
      AND ($5::text='' OR EXISTS (
        SELECT 1 FROM unnest(fm.colors) candidate(value)
        WHERE lower(candidate.value)=lower($5)
      ))
      AND (cardinality($6::text[])=0 OR fm.sizes && $6::text[])
      AND ($7::text='' OR EXISTS (
        SELECT 1 FROM unnest(fm.fits) candidate(value)
        WHERE lower(candidate.value)=lower($7)
      ))
      AND ($8::text='' OR fm.materials @> ARRAY[lower($8)]::text[])
      AND (
        $2::text='' OR
        ($9::text<>'' AND fm.search_vector @@ to_tsquery('simple',$9))
      )
    ORDER BY ${familyOrder(sort)}
    LIMIT $10 OFFSET $11
  `, [vendorId, query, categories, brand, color, sizes, fit, material, searchPrefix, limit, offset, LIVE_FALLBACK_FAMILY_CAP]);

  if (!familyWindow.rows.length) {
    familyWindow = await getLiveVendorFamilyWindow({
      vendorId,
      query,
      categories,
      brand,
      color,
      sizes,
      fit,
      material,
      searchPrefix,
      sort,
      offset,
      limit
    });
  }

  if (!familyWindow.rows.length) return { products: [], total: 0, offset, limit };
  const total = safePositiveInt(familyWindow.rows[0]?.total_families, 0);
  const supplierIds = familyWindow.rows.map((row) => row.supplier_id);
  const externalProductIds = familyWindow.rows.map((row) => row.external_product_id);

  const result = await runtime.nativePool.query<PageRow>(`
    WITH vendor AS MATERIALIZED (
      SELECT id,public_id,trading_name
      FROM vendor_businesses
      WHERE public_id=$1 AND status='active'
    ), selected AS MATERIALIZED (
      SELECT *
      FROM unnest($2::uuid[],$3::text[]) WITH ORDINALITY
        AS selected(supplier_id,external_product_id,position)
    )
    SELECT
      cv.public_id AS canonical_public_id,
      cv.family_id::text AS family_id,
      dso.supplier_id::text AS supplier_id,
      dso.external_product_id,
      vo.public_id AS offer_public_id,
      cv.slug,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      c.code AS category_code,
      rm.department_code,
      vo.customer_price_minor,
      vo.msrp_minor,
      dso.cached_quantity,
      (SELECT public_id FROM vendor) AS vendor_public_id,
      (SELECT trading_name FROM vendor) AS vendor_name,
      ds.configuration->'vendorPresentation' AS vendor_presentation
    FROM selected
    JOIN dropship_supplier_offers dso
      ON dso.supplier_id=selected.supplier_id
     AND dso.external_product_id=selected.external_product_id
    JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    LEFT JOIN public.storefront_catalog_read_model rm ON rm.canonical_variant_id=cv.id
    JOIN categories c ON c.id=cv.category_id
    JOIN vendor_locations l ON l.id=vo.location_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE ds.owner_vendor_id=(SELECT id FROM vendor)
      AND ds.active=true
      AND ds.api_authoritative_availability=true
      AND dso.active=true
      AND dso.cached_available=true
      AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
      AND dso.availability_expires_at IS NOT NULL
      AND dso.availability_expires_at>now()
      AND vo.vendor_id=(SELECT id FROM vendor)
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      AND l.active=true
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
    ORDER BY selected.position,
             vo.customer_price_minor ASC,
             dso.availability_checked_at DESC NULLS LAST,
             vo.updated_at DESC,
             vo.public_id
  `, [vendorId, supplierIds, externalProductIds]);

  const base = result.rows.flatMap((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    const msrpMinor = safeMinor(row.msrp_minor);
    if (!priceMinor || !isPublicCatalogueTitle(row.title)) return [];
    const presentation = resolveDropshipPublicFields(
      parseDropshipPresentationConfig(row.vendor_presentation),
      row.offer_public_id
    );
    return [{
      id: row.canonical_public_id,
      familyId: row.family_id,
      supplierId: row.supplier_id,
      externalProductId: row.external_product_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      departmentCode: row.department_code ?? undefined,
      priceMinor,
      msrpMinor: msrpMinor !== undefined && msrpMinor > priceMinor ? msrpMinor : null,
      available: true,
      availableToSell: safeQuantity(row.cached_quantity),
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      publicFields: presentation.fields,
      matchesFilter: true
    }];
  });

  if (!base.length) return { products: [], total, offset, limit, nextOffset: offset + limit < total ? offset + limit : undefined };

  const metadata = await loadCatalogMetadata(base.map((record) => record.id));
  const enriched = base.map((record) => ({
    ...record,
    sizes: metadata.get(record.id)?.sizes ?? []
  }));
  const matchingIds = new Set(enriched.map((record) => record.id));
  const projections = projectDropshipFamilies(enriched, matchingIds);
  const representatives = projections.map((projection) => projection.representative);

  const imageRequests = representatives.map((record) => ({
    canonicalVariantId: record.id,
    preferredVendorId: record.vendorId
  }));
  const [approvedImages, sourcePrimaryImages] = await Promise.all([
    approvedCatalogImages(imageRequests).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.vendor_dropship_page_media_failed",
        vendorId,
        message: error instanceof Error ? error.message : String(error)
      }));
      return [];
    }),
    getPublicCatalogSourcePrimaryImages(imageRequests)
  ]);
  const imageByCanonical = new Map(approvedImages.map((image) => [image.canonicalVariantId, image] as const));

  const products = projections.map((projection) => {
    const record = projection.representative;
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
    const sourceImage = sourcePrimaryImages.get(record.id);
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
      mediaAlt: image?.altText ?? sourceImage?.altText,
      previewImageSrc: image?.mediaId ? undefined : sourceImage?.src,
      supplierFulfilled: true
    } satisfies CatalogCard & Readonly<{ supplierFulfilled: true; previewImageSrc?: string }>;
  });

  return {
    products,
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : undefined
  };
}


function mergeFacetProjectionRows(
  base: readonly FacetProjectionRow[],
  supplement: readonly FacetProjectionRow[]
): FacetProjectionRow[] {
  const merged = new Map<string, FacetProjectionRow>();
  for (const row of [...base, ...supplement]) {
    const key = `\${row.facet_type}\\u0000\${row.value}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...row, count: safePositiveInt(row.count, 0) });
      continue;
    }
    merged.set(key, {
      ...existing,
      label: existing.label || row.label,
      count: safePositiveInt(existing.count, 0) + safePositiveInt(row.count, 0)
    });
  }
  return [...merged.values()];
}

async function readLiveVendorFacetSupplement(vendorId: string): Promise<FacetProjectionRow[]> {
  if (!productionDatabaseConfigured()) return [];
  const pool = getProductionPostgresRuntime().nativePool;

  // Repair only the supplier families missing from the secondary facet projection.
  // The primary family read model already carries governed availability/category/brand
  // evidence. Join the immutable source payload set-wise for color/size attributes
  // instead of re-validating thousands of raw offers inside a customer request.
  const result = await pool.query<FacetProjectionRow>(`
    WITH suppliers AS MATERIALIZED (
      SELECT ds.id,ds.id::text AS supplier_id
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
        AND ds.api_authoritative_availability=true
    ), missing_families AS MATERIALIZED (
      SELECT
        fm.dropship_supplier_id AS supplier_id,
        fm.dropship_external_product_id AS external_product_id,
        fm.category_codes,
        fm.brand_names
      FROM public.storefront_dropship_family_read_model fm
      JOIN suppliers supplier ON supplier.supplier_id=fm.dropship_supplier_id
      WHERE fm.available_until>now()
        AND NOT EXISTS (
          SELECT 1
          FROM public.storefront_dropship_family_filter_read_model projected
          WHERE projected.dropship_supplier_id=fm.dropship_supplier_id
            AND projected.dropship_external_product_id=fm.dropship_external_product_id
            AND projected.available_until>now()
        )
    ), base AS MATERIALIZED (
      SELECT DISTINCT ON (family.supplier_id,family.external_product_id)
        family.supplier_id,
        family.external_product_id,
        family.category_codes,
        family.brand_names,
        source.normalized_payload
      FROM missing_families family
      JOIN suppliers supplier ON supplier.supplier_id=family.supplier_id
      JOIN dropship_supplier_offers dso
        ON dso.supplier_id=supplier.id
       AND dso.external_product_id=family.external_product_id
       AND dso.source_product_id IS NOT NULL
      JOIN catalog_source_products source ON source.id=dso.source_product_id
      ORDER BY
        family.supplier_id,
        family.external_product_id,
        dso.updated_at DESC,
        dso.id DESC
    ), totals AS (
      SELECT 'total'::text AS facet_type,'*'::text AS value,'*'::text AS label,COUNT(*)::bigint AS count
      FROM base
    ), category_values AS (
      SELECT
        'category'::text AS facet_type,
        category_code.value AS value,
        COALESCE(MAX(NULLIF(ctel.name,'')),MAX(NULLIF(cten.name,'')),category_code.value) AS label,
        COUNT(*)::bigint AS count
      FROM base b
      CROSS JOIN LATERAL unnest(b.category_codes) AS category_code(value)
      LEFT JOIN public.markets market ON market.code='sparta'
      LEFT JOIN public.categories category
        ON category.market_id=market.id
       AND category.code=category_code.value
      LEFT JOIN public.category_translations ctel
        ON ctel.category_id=category.id
       AND ctel.locale='el'
      LEFT JOIN public.category_translations cten
        ON cten.category_id=category.id
       AND cten.locale='en'
      GROUP BY category_code.value
    ), brand_values AS (
      SELECT
        'brand'::text AS facet_type,
        brand.value AS value,
        brand.value AS label,
        COUNT(*)::bigint AS count
      FROM base b
      CROSS JOIN LATERAL unnest(b.brand_names) AS brand(value)
      WHERE BTRIM(brand.value)<>''
      GROUP BY brand.value
    ), color_values AS (
      SELECT
        'color'::text AS facet_type,
        option.value AS value,
        option.value AS label,
        COUNT(DISTINCT (b.supplier_id,b.external_product_id))::bigint AS count
      FROM base b
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(b.normalized_payload->'attributes')='array'
            THEN b.normalized_payload->'attributes'
          ELSE '[]'::jsonb
        END
      ) attribute
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(attribute->'options')='array'
            THEN attribute->'options'
          ELSE '[]'::jsonb
        END
      ) option(value)
      WHERE lower(COALESCE(attribute->>'name',''))='color'
        AND BTRIM(option.value)<>''
      GROUP BY option.value
    ), size_values AS (
      SELECT
        'size'::text AS facet_type,
        option.value AS value,
        option.value AS label,
        COUNT(DISTINCT (b.supplier_id,b.external_product_id))::bigint AS count
      FROM base b
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(b.normalized_payload->'variants')='array'
            THEN b.normalized_payload->'variants'
          ELSE '[]'::jsonb
        END
      ) variant
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(variant->'attributes')='array'
            THEN variant->'attributes'
          ELSE '[]'::jsonb
        END
      ) attribute
      CROSS JOIN LATERAL (
        SELECT NULLIF(BTRIM(attribute->>'option'),'') AS value
      ) option
      WHERE lower(COALESCE(attribute->>'name','')) LIKE '%size%'
        AND option.value IS NOT NULL
      GROUP BY option.value
    )
    SELECT * FROM totals
    UNION ALL SELECT * FROM category_values
    UNION ALL SELECT * FROM brand_values
    UNION ALL SELECT * FROM color_values
    UNION ALL SELECT * FROM size_values
  `, [vendorId]);
  return result.rows;
}

async function readVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) return { total: 0, categories: [], brands: [], colors: [], sizes: [], fits: [], materials: [] };
  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query<FacetProjectionRow>(`
    WITH suppliers AS MATERIALIZED (
      SELECT ds.id::text AS supplier_id
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
    )
    SELECT
      facets.facet_type,
      facets.value,
      COALESCE(MAX(NULLIF(facets.label,'')),facets.value) AS label,
      SUM(facets.count)::bigint AS count
    FROM public.storefront_dropship_vendor_facets facets
    JOIN suppliers s ON s.supplier_id=facets.supplier_id
    GROUP BY facets.facet_type,facets.value
    ORDER BY facets.facet_type,label,facets.value
  `, [vendorId]);

  let facetRows = result.rows;
  try {
    const supplement = await readLiveVendorFacetSupplement(vendorId);
    if (supplement.length) facetRows = mergeFacetProjectionRows(facetRows, supplement);
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "storefront.vendor_catalog_live_facet_supplement_failed",
      vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
  }
  if (!facetRows.length) {
    const fallback = await pool.query<FacetProjectionRow>(`
      WITH suppliers AS MATERIALIZED (
        SELECT ds.id,ds.id::text AS supplier_id
        FROM dropship_suppliers ds
        JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
        WHERE v.public_id=$1
          AND v.status='active'
          AND ds.active=true
          AND ds.api_authoritative_availability=true
      ), stable AS MATERIALIZED (
        SELECT
          fm.dropship_supplier_id AS supplier_id,
          fm.dropship_external_product_id AS external_product_id,
          fm.category_codes,
          fm.brand_names AS brand_names,
          fm.colors
        FROM public.storefront_dropship_family_read_model fm
        JOIN suppliers s ON s.supplier_id=fm.dropship_supplier_id
        WHERE fm.available_until>now()
      ), missing_suppliers AS MATERIALIZED (
        SELECT s.id,s.supplier_id
        FROM suppliers s
        WHERE NOT EXISTS (
          SELECT 1 FROM stable projected WHERE projected.supplier_id=s.supplier_id
        )
      ), live_missing AS MATERIALIZED (
        SELECT
          dso.supplier_id::text AS supplier_id,
          dso.external_product_id,
          COALESCE(array_agg(DISTINCT c.code) FILTER (WHERE c.code IS NOT NULL),'{}'::text[]) AS category_codes,
          COALESCE(array_agg(DISTINCT lower(COALESCE(b.name,pfb.name,'')))
            FILTER (WHERE COALESCE(b.name,pfb.name,'')<>''),'{}'::text[]) AS brand_names,
          '{}'::text[] AS colors
        FROM dropship_supplier_offers dso
        JOIN missing_suppliers supplier ON supplier.id=dso.supplier_id
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN categories c ON c.id=cv.category_id
        JOIN vendor_locations l ON l.id=vo.location_id
        LEFT JOIN product_families pf ON pf.id=cv.family_id
        LEFT JOIN brands b ON b.id=cv.brand_id
        LEFT JOIN brands pfb ON pfb.id=pf.brand_id
        WHERE dso.active=true
          AND dso.cached_available=true
          AND COALESCE(dso.cached_quantity,0)>=1
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND l.active=true
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        GROUP BY dso.supplier_id,dso.external_product_id
      ), base AS MATERIALIZED (
        SELECT supplier_id,external_product_id,category_codes,brand_names,colors FROM stable
        UNION ALL
        SELECT supplier_id,external_product_id,category_codes,brand_names,colors FROM live_missing
      ), totals AS (
        SELECT 'total'::text AS facet_type,'*'::text AS value,'*'::text AS label,COUNT(*)::bigint AS count
        FROM base
      ), category_values AS (
        SELECT
          'category'::text AS facet_type,
          category_code.value AS value,
          COALESCE(MAX(NULLIF(ctel.name,'')),MAX(NULLIF(cten.name,'')),category_code.value) AS label,
          COUNT(*)::bigint AS count
        FROM base b
        CROSS JOIN LATERAL unnest(b.category_codes) AS category_code(value)
        LEFT JOIN public.markets m ON m.code='sparta'
        LEFT JOIN public.categories c ON c.market_id=m.id AND c.code=category_code.value
        LEFT JOIN public.category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
        LEFT JOIN public.category_translations cten ON cten.category_id=c.id AND cten.locale='en'
        GROUP BY category_code.value
      ), brand_values AS (
        SELECT
          'brand'::text AS facet_type,
          brand.value AS value,
          brand.value AS label,
          COUNT(*)::bigint AS count
        FROM base b
        CROSS JOIN LATERAL unnest(b.brand_names) AS brand(value)
        WHERE btrim(brand.value)<>''
        GROUP BY brand.value
      ), color_values AS (
        SELECT
          'color'::text AS facet_type,
          color.value AS value,
          color.value AS label,
          COUNT(*)::bigint AS count
        FROM base b
        CROSS JOIN LATERAL unnest(b.colors) AS color(value)
        WHERE btrim(color.value)<>''
        GROUP BY color.value
      )
      SELECT * FROM totals
      UNION ALL SELECT * FROM category_values
      UNION ALL SELECT * FROM brand_values
      UNION ALL SELECT * FROM color_values
      ORDER BY facet_type,label,value
    `, [vendorId]);
    facetRows = fallback.rows;
  }

  let total = 0;
  const categories: VendorDropshipFacetOption[] = [];
  const brands: VendorDropshipFacetOption[] = [];
  const colors: VendorDropshipFacetOption[] = [];
  const sizes: VendorDropshipFacetOption[] = [];
  for (const row of facetRows) {
    const entry = { value: row.value, label: row.label || row.value, count: safePositiveInt(row.count, 0) };
    if (row.facet_type === "total") total = entry.count;
    else if (row.facet_type === "category") categories.push(entry);
    else if (row.facet_type === "brand") brands.push(entry);
    else if (row.facet_type === "color") colors.push(entry);
    else if (row.facet_type === "size") sizes.push(entry);
  }
  return { total, categories, brands, colors, sizes, fits: [], materials: [] };
}

const cachedVendorDropshipFacets = unstable_cache(
  readVendorDropshipFacets,
  ["vendor-dropship-storefront-preaggregated-facets-v5"],
  { revalidate: 300 }
);

export function getVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  return cachedVendorDropshipFacets(vendorId);
}

import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { VendorDropshipFacetOption, VendorDropshipFacets, VendorDropshipSort } from "./vendor-dropship-catalog-page";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 60;

type LocalRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  available_to_sell: number | string;
  vendor_public_id: string;
  vendor_name: string;
}>;

type CountRow = Readonly<{
  total: number | string;
  has_dropship: boolean;
}>;

type FacetRow = Readonly<{
  facet_type: "total" | "category" | "brand" | "color" | "size";
  value: string;
  label: string;
  count: number | string;
}>;

export type VendorLocalCatalogPageInput = Readonly<{
  query?: string;
  categories?: readonly string[];
  brand?: string;
  color?: string;
  sizes?: readonly string[];
  fit?: string;
  material?: string;
  sort?: VendorDropshipSort;
  availableOnly?: boolean;
  offset?: number;
  limit?: number;
}>;

export type VendorLocalCatalogPage = Readonly<{
  products: readonly CatalogCard[];
  total: number;
  hasDropship: boolean;
  offset: number;
  limit: number;
  nextOffset?: number;
}>;

function safePositiveInt(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

function safeMinor(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function safeQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function values(input: readonly string[] | undefined, max = 64): readonly string[] {
  return [...new Set((input ?? []).map((value) => value.trim().slice(0, 120)).filter(Boolean))].slice(0, max);
}

function normalizedSort(value: VendorDropshipSort | undefined): VendorDropshipSort {
  return value === "price_asc" || value === "price_desc" || value === "name_asc" ? value : "recommended";
}

function orderBy(sort: VendorDropshipSort): string {
  if (sort === "price_asc") return "base.customer_price_minor ASC,lower(base.title),base.canonical_public_id";
  if (sort === "price_desc") return "base.customer_price_minor DESC,lower(base.title),base.canonical_public_id";
  if (sort === "name_asc") return "lower(base.title),base.canonical_public_id";
  return "base.available_to_sell DESC,base.updated_at DESC,base.canonical_public_id";
}

function baseSql(order: string) {
  return `
    WITH vendor AS MATERIALIZED (
      SELECT id,public_id,trading_name
      FROM vendor_businesses
      WHERE public_id=$1 AND status='active'
      LIMIT 1
    ), base AS MATERIALIZED (
      SELECT DISTINCT ON (cv.id)
        cv.public_id AS canonical_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        c.code AS category_code,
        b.name AS brand_name,
        COALESCE(el.specifications->>'color',en.specifications->>'color',cv.variant_attributes->>'color','') AS color_value,
        COALESCE(el.specifications->>'size',en.specifications->>'size',cv.variant_attributes->>'size','') AS size_value,
        COALESCE(el.specifications->>'fit',en.specifications->>'fit','') AS fit_value,
        COALESCE(el.specifications->>'material',en.specifications->>'material',el.specifications->>'composition',en.specifications->>'composition','') AS material_value,
        vo.customer_price_minor,
        GREATEST(
          COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0),
          0
        )::int AS available_to_sell,
        vo.updated_at,
        (SELECT public_id FROM vendor) AS vendor_public_id,
        (SELECT trading_name FROM vendor) AS vendor_name
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.vendor_id=(SELECT id FROM vendor)
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND l.active=true
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND NOT EXISTS (
          SELECT 1
          FROM dropship_supplier_offers dso
          WHERE dso.vendor_offer_id=vo.id
        )
      ORDER BY cv.id,
               (GREATEST(COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0),0)>0) DESC,
               vo.updated_at DESC,
               vo.id DESC
    ), filtered AS (
      SELECT *
      FROM base
      WHERE ($2::text='' OR title ILIKE '%'||$2||'%' OR COALESCE(brand_name,'') ILIKE '%'||$2||'%')
        AND (cardinality($3::text[])=0 OR category_code=ANY($3::text[]))
        AND ($4::text='' OR lower(COALESCE(brand_name,''))=lower($4))
        AND ($5::text='' OR lower(color_value)=lower($5))
        AND (cardinality($6::text[])=0 OR size_value=ANY($6::text[]))
        AND ($7::text='' OR lower(fit_value)=lower($7))
        AND ($8::text='' OR lower(material_value) LIKE '%'||lower($8)||'%')
        AND (NOT $9::boolean OR available_to_sell>0)
    )
    SELECT canonical_public_id,slug,title,category_code,customer_price_minor,available_to_sell,
           vendor_public_id,vendor_name
    FROM filtered base
    ORDER BY ${order}
    LIMIT $10 OFFSET $11
  `;
}

export async function getVendorLocalCatalogPage(
  vendorId: string,
  input: VendorLocalCatalogPageInput = {}
): Promise<VendorLocalCatalogPage> {
  const offset = safePositiveInt(input.offset, 0, 100_000);
  const limit = Math.max(1, safePositiveInt(input.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  if (!productionDatabaseConfigured()) return { products: [], total: 0, hasDropship: false, offset, limit };

  const query = input.query?.trim().slice(0, 160) ?? "";
  const categories = values(input.categories);
  const brand = input.brand?.trim().slice(0, 160) ?? "";
  const color = input.color?.trim().slice(0, 120) ?? "";
  const sizes = values(input.sizes);
  const fit = input.fit?.trim().slice(0, 120) ?? "";
  const material = input.material?.trim().slice(0, 120) ?? "";
  const availableOnly = input.availableOnly === true;
  const sort = normalizedSort(input.sort);
  const runtime = getProductionPostgresRuntime();

  const countResult = await runtime.nativePool.query<CountRow>(`
    WITH vendor AS MATERIALIZED (
      SELECT id
      FROM vendor_businesses
      WHERE public_id=$1 AND status='active'
      LIMIT 1
    ), base AS MATERIALIZED (
      SELECT DISTINCT ON (cv.id)
        cv.id,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        c.code AS category_code,
        b.name AS brand_name,
        COALESCE(el.specifications->>'color',en.specifications->>'color',cv.variant_attributes->>'color','') AS color_value,
        COALESCE(el.specifications->>'size',en.specifications->>'size',cv.variant_attributes->>'size','') AS size_value,
        COALESCE(el.specifications->>'fit',en.specifications->>'fit','') AS fit_value,
        COALESCE(el.specifications->>'material',en.specifications->>'material',el.specifications->>'composition',en.specifications->>'composition','') AS material_value,
        GREATEST(
          COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0),
          0
        )::int AS available_to_sell
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.vendor_id=(SELECT id FROM vendor)
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND l.active=true
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND NOT EXISTS (SELECT 1 FROM dropship_supplier_offers dso WHERE dso.vendor_offer_id=vo.id)
      ORDER BY cv.id,
               (GREATEST(COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0),0)>0) DESC,
               vo.updated_at DESC,
               vo.id DESC
    )
    SELECT
      count(*) FILTER (
        WHERE ($2::text='' OR title ILIKE '%'||$2||'%' OR COALESCE(brand_name,'') ILIKE '%'||$2||'%')
          AND (cardinality($3::text[])=0 OR category_code=ANY($3::text[]))
          AND ($4::text='' OR lower(COALESCE(brand_name,''))=lower($4))
          AND ($5::text='' OR lower(color_value)=lower($5))
          AND (cardinality($6::text[])=0 OR size_value=ANY($6::text[]))
          AND ($7::text='' OR lower(fit_value)=lower($7))
          AND ($8::text='' OR lower(material_value) LIKE '%'||lower($8)||'%')
          AND (NOT $9::boolean OR available_to_sell>0)
      )::int AS total,
      EXISTS (
        SELECT 1
        FROM dropship_suppliers ds
        WHERE ds.owner_vendor_id=(SELECT id FROM vendor)
          AND ds.active=true
          AND ds.api_authoritative_availability=true
      ) AS has_dropship
    FROM base
  `, [vendorId, query, categories, brand, color, sizes, fit, material, availableOnly]);

  const total = safePositiveInt(countResult.rows[0]?.total, 0);
  const hasDropship = countResult.rows[0]?.has_dropship === true;
  if (!total || offset >= total) return { products: [], total, hasDropship, offset, limit };

  const result = await runtime.nativePool.query<LocalRow>(
    baseSql(orderBy(sort)),
    [vendorId, query, categories, brand, color, sizes, fit, material, availableOnly, limit, offset]
  );

  const metadata = await loadCatalogMetadata(result.rows.map((row) => row.canonical_public_id));
  const images = await approvedCatalogImages(result.rows.map((row) => ({
    canonicalVariantId: row.canonical_public_id,
    preferredVendorId: row.vendor_public_id
  }))).catch(() => []);
  const imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));

  const products = result.rows.map((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    const availableToSell = safeQuantity(row.available_to_sell);
    const details = metadata.get(row.canonical_public_id);
    const image = imageByCanonical.get(row.canonical_public_id);
    return {
      id: row.canonical_public_id,
      slug: row.slug,
      title: details?.title ?? row.title,
      priceMinor,
      price: formatMoney(money(priceMinor)),
      categoryCode: row.category_code,
      categoryLabel: details?.categoryLabel,
      gtin: details?.gtin,
      mpn: details?.mpn,
      description: details?.description,
      brand: details?.brand,
      brandLogoObjectKey: details?.brandLogoObjectKey,
      color: details?.color,
      sizes: details?.sizes ?? [],
      fit: details?.fit,
      composition: details?.composition,
      madeIn: details?.madeIn,
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      availableToSell,
      available: availableToSell > 0
    } satisfies CatalogCard;
  });

  return {
    products,
    total,
    hasDropship,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : undefined
  };
}

function facetOption(row: FacetRow): VendorDropshipFacetOption {
  return { value: row.value, label: row.label, count: safePositiveInt(row.count, 0) };
}

export async function getVendorLocalCatalogFacets(vendorId: string): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) {
    return { total: 0, categories: [], brands: [], colors: [], sizes: [], fits: [], materials: [] };
  }
  const result = await getProductionPostgresRuntime().nativePool.query<FacetRow>(`
    WITH vendor AS MATERIALIZED (
      SELECT id
      FROM vendor_businesses
      WHERE public_id=$1 AND status='active'
      LIMIT 1
    ), base AS MATERIALIZED (
      SELECT DISTINCT ON (cv.id)
        cv.id,
        c.code AS category_code,
        COALESCE(ctel.name,cten.name,c.code) AS category_label,
        COALESCE(b.name,'') AS brand_name,
        COALESCE(el.specifications->>'color',en.specifications->>'color',cv.variant_attributes->>'color','') AS color_value,
        COALESCE(el.specifications->>'size',en.specifications->>'size',cv.variant_attributes->>'size','') AS size_value
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      LEFT JOIN category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
      LEFT JOIN category_translations cten ON cten.category_id=c.id AND cten.locale='en'
      WHERE vo.vendor_id=(SELECT id FROM vendor)
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND l.active=true
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND NOT EXISTS (SELECT 1 FROM dropship_supplier_offers dso WHERE dso.vendor_offer_id=vo.id)
      ORDER BY cv.id,vo.updated_at DESC,vo.id DESC
    )
    SELECT 'total'::text AS facet_type,''::text AS value,''::text AS label,count(*)::int AS count FROM base
    UNION ALL
    SELECT 'category',category_code,category_label,count(*)::int FROM base GROUP BY category_code,category_label
    UNION ALL
    SELECT 'brand',brand_name,brand_name,count(*)::int FROM base WHERE brand_name<>'' GROUP BY brand_name
    UNION ALL
    SELECT 'color',color_value,color_value,count(*)::int FROM base WHERE color_value<>'' GROUP BY color_value
    UNION ALL
    SELECT 'size',size_value,size_value,count(*)::int FROM base WHERE size_value<>'' GROUP BY size_value
  `, [vendorId]);

  const total = safePositiveInt(result.rows.find((row) => row.facet_type === "total")?.count, 0);
  const byType = (type: FacetRow["facet_type"]) => result.rows
    .filter((row) => row.facet_type === type && row.value)
    .map(facetOption)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "el"));

  return {
    total,
    categories: byType("category"),
    brands: byType("brand"),
    colors: byType("color"),
    sizes: byType("size"),
    fits: [],
    materials: []
  };
}

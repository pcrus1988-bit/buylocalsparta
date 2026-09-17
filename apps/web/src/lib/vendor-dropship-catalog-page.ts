import { formatMoney, money } from "@buy-local-sparta/core";
import { unstable_cache } from "next/cache";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_PAGE_SIZE = 36;
const MAX_PAGE_SIZE = 60;

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
  const offset = safePositiveInt(input.offset, 0, 100_000);
  const limit = Math.max(1, safePositiveInt(input.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const searchPrefix = prefixTsQuery(query);
  const runtime = getProductionPostgresRuntime();

  const familyWindow = await runtime.nativePool.query<FamilySelectionRow>(`
    SELECT
      fm.dropship_supplier_id AS supplier_id,
      fm.dropship_external_product_id AS external_product_id,
      COUNT(*) OVER()::int AS total_families
    FROM public.storefront_dropship_family_filter_read_model fm
    WHERE fm.dropship_supplier_id IN (
      SELECT ds.id::text
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
    )
      AND fm.available_until>now()
      AND (cardinality($3::text[])=0 OR fm.category_codes && $3::text[])
      AND ($4::text='' OR fm.brand_names_normalized @> ARRAY[lower($4)]::text[])
      AND ($5::text='' OR EXISTS (
        SELECT 1 FROM unnest(fm.colors) candidate(value)
        WHERE lower(candidate.value)=lower($5)
      ))
      AND (cardinality($6::text[])=0 OR fm.sizes && $6::text[])
      AND (
        $2::text='' OR
        ($7::text<>'' AND fm.search_vector @@ to_tsquery('simple',$7))
      )
    ORDER BY fm.newest_at DESC,fm.dropship_supplier_id,fm.dropship_external_product_id
    LIMIT $8 OFFSET $9
  `, [vendorId, query, categories, brand, color, sizes, searchPrefix, limit, offset]);

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

  let imageByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(representatives.map((record) => ({
      canonicalVariantId: record.id,
      preferredVendorId: record.vendorId
    })));
    imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.vendor_dropship_page_media_failed",
      vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  const products = projections.map((projection) => {
    const record = projection.representative;
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
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
      mediaAlt: image?.altText,
      supplierFulfilled: true
    } satisfies CatalogCard & Readonly<{ supplierFulfilled: true }>;
  });

  return {
    products,
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : undefined
  };
}

async function readVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) return { total: 0, categories: [], brands: [], colors: [], sizes: [] };
  const result = await getProductionPostgresRuntime().nativePool.query<FacetProjectionRow>(`
    SELECT facets.facet_type,facets.value,facets.label,facets.count
    FROM public.storefront_dropship_vendor_facets facets
    WHERE facets.supplier_id=(
      SELECT ds.id::text
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1 AND v.status='active' AND ds.active=true
      LIMIT 1
    )
    ORDER BY facets.facet_type,facets.label,facets.value
  `, [vendorId]);

  let total = 0;
  const categories: VendorDropshipFacetOption[] = [];
  const brands: VendorDropshipFacetOption[] = [];
  const colors: VendorDropshipFacetOption[] = [];
  const sizes: VendorDropshipFacetOption[] = [];
  for (const row of result.rows) {
    const entry = { value: row.value, label: row.label || row.value, count: safePositiveInt(row.count, 0) };
    if (row.facet_type === "total") total = entry.count;
    else if (row.facet_type === "category") categories.push(entry);
    else if (row.facet_type === "brand") brands.push(entry);
    else if (row.facet_type === "color") colors.push(entry);
    else if (row.facet_type === "size") sizes.push(entry);
  }
  return { total, categories, brands, colors, sizes };
}

const cachedVendorDropshipFacets = unstable_cache(
  readVendorDropshipFacets,
  ["vendor-dropship-storefront-preaggregated-facets-v2"],
  { revalidate: 300 }
);

export function getVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  return cachedVendorDropshipFacets(vendorId);
}

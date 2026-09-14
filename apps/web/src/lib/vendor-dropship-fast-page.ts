import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata } from "./catalog-metadata";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 60;

type HiddenCategoryRow = Readonly<{ id: string }>;
type FastPageRow = Readonly<{
  canonical_public_id: string;
  family_id: string | null;
  supplier_id: string;
  external_product_id: string;
  offer_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  cached_quantity: number | string | null;
  currently_available: boolean;
  vendor_public_id: string;
  vendor_name: string;
  vendor_presentation: unknown;
  source_product_id: string;
}>;

type FastPageMarkerRow = Readonly<{
  supplier_id: string;
  source_product_id: string;
}>;

export type FastVendorDropshipCatalogPage = Readonly<{
  products: readonly CatalogCard[];
  offset: number;
  limit: number;
  nextOffset?: number;
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
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function hiddenVendorCategoryIds(vendorId: string): Promise<readonly string[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<HiddenCategoryRow>(`
    WITH RECURSIVE hidden AS (
      SELECT vcv.category_id AS id
      FROM vendor_category_visibility vcv
      JOIN vendor_businesses v ON v.id=vcv.vendor_id
      WHERE v.public_id=$1 AND vcv.visible=false
      UNION
      SELECT child.id
      FROM categories child
      JOIN hidden parent ON child.parent_id=parent.id
    )
    SELECT id::text AS id FROM hidden
  `, [vendorId]);
  return result.rows.map((row) => row.id);
}

/**
 * Latency-critical unfiltered dropshipping storefront page.
 *
 * Pagination starts from currently sellable supplier products only. Unavailable,
 * zero-stock or stale supplier rows never consume page slots and are never hydrated.
 * PostgreSQL can therefore stop as soon as it finds limit+1 sellable products;
 * translations, metadata and media are hydrated only for the selected product page.
 *
 * Search/filter requests intentionally remain on the full semantic query so this
 * optimization cannot narrow discovery or change filter behaviour.
 */
export async function getFastVendorDropshipCatalogPage(
  vendorId: string,
  input: Readonly<{ offset?: number; limit?: number }> = {}
): Promise<FastVendorDropshipCatalogPage> {
  const offset = safePositiveInt(input.offset, 0, 100_000);
  const limit = Math.max(1, safePositiveInt(input.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  if (!productionDatabaseConfigured()) return { products: [], offset, limit };

  const hiddenCategoryIds = await hiddenVendorCategoryIds(vendorId);
  const runtime = getProductionPostgresRuntime();
  const markerResult = await runtime.nativePool.query<FastPageMarkerRow>(`
    WITH vendor AS MATERIALIZED (
      SELECT id
      FROM vendor_businesses
      WHERE public_id=$1 AND status='active'
    ), markers AS (
      SELECT DISTINCT dso.supplier_id,
                      dso.source_product_id
      FROM dropship_supplier_offers dso
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN vendor_locations l ON l.id=vo.location_id
      WHERE ds.owner_vendor_id=(SELECT id FROM vendor)
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND dso.active=true
        AND dso.cached_available=true
        AND dso.cached_quantity>=1
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND dso.source_product_id IS NOT NULL
        AND vo.vendor_id=(SELECT id FROM vendor)
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND l.active=true
        AND cv.market_id=(SELECT id FROM markets WHERE code='sparta')
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND (cardinality($2::uuid[])=0 OR NOT (cv.category_id=ANY($2::uuid[])))
      ORDER BY dso.supplier_id,dso.source_product_id
      LIMIT $3 OFFSET $4
    )
    SELECT supplier_id::text AS supplier_id,
           source_product_id::text AS source_product_id
    FROM markers
  `, [vendorId, hiddenCategoryIds, limit + 1, offset]);

  const hasMore = markerResult.rows.length > limit;
  const selected = markerResult.rows.slice(0, limit);
  if (!selected.length) return { products: [], offset, limit };

  const supplierIds = selected.map((row) => row.supplier_id);
  const sourceProductIds = selected.map((row) => row.source_product_id);
  const result = await runtime.nativePool.query<FastPageRow>(`
    WITH vendor AS MATERIALIZED (
      SELECT id,public_id,trading_name
      FROM vendor_businesses
      WHERE public_id=$1 AND status='active'
    ), selected AS MATERIALIZED (
      SELECT *
      FROM unnest($2::uuid[],$3::uuid[]) WITH ORDINALITY
        AS selected(supplier_id,source_product_id,position)
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
      vo.customer_price_minor,
      dso.cached_quantity,
      true AS currently_available,
      (SELECT public_id FROM vendor) AS vendor_public_id,
      (SELECT trading_name FROM vendor) AS vendor_name,
      ds.configuration->'vendorPresentation' AS vendor_presentation,
      dso.source_product_id::text AS source_product_id
    FROM selected
    JOIN dropship_supplier_offers dso
      ON dso.supplier_id=selected.supplier_id
     AND dso.source_product_id=selected.source_product_id
    JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
    JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN categories c ON c.id=cv.category_id
    JOIN vendor_locations l ON l.id=vo.location_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE ds.owner_vendor_id=(SELECT id FROM vendor)
      AND ds.active=true
      AND ds.api_authoritative_availability=true
      AND dso.active=true
      AND dso.cached_available=true
      AND dso.cached_quantity>=1
      AND dso.availability_expires_at IS NOT NULL
      AND dso.availability_expires_at>now()
      AND vo.vendor_id=(SELECT id FROM vendor)
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      AND l.active=true
      AND cv.market_id=(SELECT id FROM markets WHERE code='sparta')
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND (cardinality($4::uuid[])=0 OR NOT (cv.category_id=ANY($4::uuid[])))
    ORDER BY selected.position,
             vo.customer_price_minor ASC,
             dso.availability_checked_at DESC NULLS LAST,
             vo.updated_at DESC,
             vo.public_id
  `, [vendorId, supplierIds, sourceProductIds, hiddenCategoryIds]);

  const base = result.rows.flatMap((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    if (!priceMinor || !isPublicCatalogueTitle(row.title)) return [];
    const presentation = resolveDropshipPublicFields(
      parseDropshipPresentationConfig(row.vendor_presentation),
      row.offer_public_id
    );
    const available = row.currently_available === true;
    return [{
      id: row.canonical_public_id,
      familyId: row.family_id,
      supplierId: row.supplier_id,
      externalProductId: row.external_product_id,
      sourceProductId: row.source_product_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      priceMinor,
      available,
      availableToSell: available ? safeQuantity(row.cached_quantity) : 0,
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      publicFields: presentation.fields,
      matchesFilter: true
    }];
  });

  if (!base.length) {
    return {
      products: [],
      offset,
      limit,
      nextOffset: hasMore ? offset + limit : undefined
    };
  }

  const ids = base.map((record) => record.id);
  const [departmentCodes, metadata] = await Promise.all([
    loadCatalogDepartmentCodes(ids),
    loadCatalogMetadata(ids)
  ]);
  const enriched = base.map((record) => ({
    ...record,
    departmentCode: departmentCodes.get(record.id),
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
      event: "storefront.vendor_dropship_fast_page_media_failed",
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
      sourceProductId: _sourceProductId,
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
    offset,
    limit,
    nextOffset: hasMore ? offset + limit : undefined
  };
}

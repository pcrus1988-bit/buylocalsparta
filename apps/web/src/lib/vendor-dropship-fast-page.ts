import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 60;
const MAX_LIVE_FALLBACK_WINDOW = 100_100;

type FastPageRow = Readonly<{
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
  currently_available: boolean;
  vendor_public_id: string;
  vendor_name: string;
  vendor_presentation: unknown;
}>;

type FastPageMarkerRow = Readonly<{
  supplier_id: string;
  external_product_id: string;
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

/**
 * Latency-critical unfiltered dropshipping storefront page.
 *
 * Family discovery is served by the supplier-scoped read model index, then only
 * the selected families are revalidated against authoritative supplier/offer data.
 */
export async function getFastVendorDropshipCatalogPage(
  vendorId: string,
  input: Readonly<{ offset?: number; limit?: number }> = {}
): Promise<FastVendorDropshipCatalogPage> {
  const offset = safePositiveInt(input.offset, 0, 100_000);
  const limit = Math.max(1, safePositiveInt(input.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  if (!productionDatabaseConfigured()) return { products: [], offset, limit };

  const runtime = getProductionPostgresRuntime();

  // Blend the indexed catalogue with suppliers that do not have any fresh
  // projection yet. This keeps the fast path cheap for healthy suppliers while
  // ensuring newly-onboarded suppliers (for example Symphonya) are represented
  // from page 1 instead of only after thousands of projected products.
  const markerResult = await runtime.nativePool.query<FastPageMarkerRow>(`
    WITH vendor_suppliers AS MATERIALIZED (
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
        fm.newest_at
      FROM public.storefront_dropship_family_read_model fm
      JOIN vendor_suppliers supplier ON supplier.supplier_id=fm.dropship_supplier_id
      WHERE fm.available_until>now()
    ), missing_suppliers AS MATERIALIZED (
      SELECT supplier.id,supplier.supplier_id
      FROM vendor_suppliers supplier
      WHERE NOT EXISTS (
        SELECT 1
        FROM stable projected
        WHERE projected.supplier_id=supplier.supplier_id
      )
    ), live_fallback AS MATERIALIZED (
      SELECT
        dso.supplier_id::text AS supplier_id,
        dso.external_product_id,
        MAX(vo.updated_at) AS newest_at
      FROM dropship_supplier_offers dso
      JOIN missing_suppliers supplier ON supplier.id=dso.supplier_id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN vendor_locations l ON l.id=vo.location_id
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
    ), combined AS (
      SELECT supplier_id,external_product_id,newest_at,0::int AS source_priority FROM stable
      UNION ALL
      SELECT supplier_id,external_product_id,newest_at,1::int AS source_priority FROM live_fallback
    )
    SELECT supplier_id,external_product_id
    FROM combined
    ORDER BY md5(supplier_id || ':' || external_product_id),source_priority,newest_at DESC
    LIMIT $2 OFFSET $3
  `, [vendorId, limit + 1, offset]);

  const markerRows = markerResult.rows;
  const hasMore = markerRows.length > limit;

  const selected = markerRows.slice(0, limit);
  if (!selected.length) return { products: [], offset, limit };

  const supplierIds = selected.map((row) => row.supplier_id);
  const externalProductIds = selected.map((row) => row.external_product_id);
  const result = await runtime.nativePool.query<FastPageRow>(`
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
      true AS currently_available,
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
    const available = row.currently_available === true;
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

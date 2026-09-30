import { formatMoney, money, normalizeSearchText, searchTextRelevance } from "@buy-local-sparta/core";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import { matchesCatalogAttributeFilters } from "./catalog-attribute-filter";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { loadCatalogMetadata } from "./catalog-metadata";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { approvedCatalogImages } from "./public-media-service";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { categoryCodeMatches } from "./storefront-taxonomy";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { decodeCatalogSizeGroup } from "./catalog-size";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";

const VENDOR_STOREFRONT_VARIANT_CAP = 480;

type PublishedDropshipRow = Readonly<{
  canonical_public_id: string;
  family_id: string | null;
  supplier_id: string;
  external_product_id: string;
  offer_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  msrp_minor: number | string | null;
  cached_quantity: number | string | null;
  currently_available: boolean;
  vendor_public_id: string;
  vendor_name: string;
  vendor_presentation: unknown;
  source_code: string | null;
  source_website: string | null;
  source_image_url: string | null;
}>;

function safeMinor(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function safeQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function sameFilterValue(left: string | undefined, right: string | undefined): boolean {
  if (!right) return true;
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

/**
 * Public browsing projection for explicitly published NORMAL-channel dropshipping offers.
 * BAZAAR inventory is intentionally excluded at SQL level and has its own discovery surface.
 *
 * Publication and supplier-stock freshness are deliberately separate concerns. A published
 * supplier product remains discoverable when its short-lived availability assertion expires,
 * but stale/out-of-stock children contribute zero sellable quantity and are never represented
 * as immediately available. Checkout/reservation still revalidates the exact supplier variant
 * against the supplier API before an order can be authorised.
 *
 * Supplier variants remain independent canonical variants/offers for stock, price
 * and checkout. Browsing first evaluates category/search/facet policy per child,
 * then collapses qualified children to one customer-facing family. Family-less
 * staged rows use the authoritative supplier + external-product parent identity,
 * so an incomplete backfill cannot recreate one-card-per-size duplication.
 *
 * `dropship_supplier_offers.cached_*` is deliberately used only as catalogue
 * browsing evidence. It is not a checkout/reservation authority and it must never
 * be copied into `inventory_balances`.
 *
 * Supplier/product public-field policy is resolved for each child before metadata
 * is searched. This prevents a sibling with stricter presentation controls from
 * leaking GTIN/MPN/technical metadata through family-level search.
 *
 * A vendor storefront is a discovery surface, not a bulk catalogue export. Supplier
 * publication can create tens of thousands of child variants for one vendor. Hydrating
 * all of them synchronously makes the page scale linearly with supplier catalogue size
 * and can exhaust the web database statement timeout. For a vendor-scoped storefront,
 * preselect a bounded window before the expensive governance/translation joins. Global
 * catalogue/search and canonical-detail calls retain the complete projection path.
 */
export async function getPublishedDropshipCatalogCards(
  query = "",
  category = "",
  filters: CatalogFilters = {},
  attributeFilters: CatalogAttributeFilters = {},
  vendorId?: string,
  canonicalVariantId?: string
): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];

  const runtime = getProductionPostgresRuntime();
  const vendorStorefrontScope = Boolean(vendorId && !canonicalVariantId);
  const result = vendorStorefrontScope
    ? await runtime.nativePool.query<PublishedDropshipRow>(`
      WITH vendor_scope AS MATERIALIZED (
        SELECT
          vo.id,
          vo.public_id,
          vo.vendor_id,
          vo.location_id,
          vo.canonical_variant_id,
          vo.customer_price_minor,
          vo.msrp_minor,
          vo.cost_ceiling_minor,
          vo.supplier_unit_price_minor,
          vo.updated_at,
          dso.supplier_id,
          dso.external_product_id,
          dso.source_product_id,
          dso.cached_quantity,
          dso.cached_available,
          dso.availability_expires_at,
          dso.availability_checked_at
        FROM vendor_offers vo
        JOIN vendor_businesses vendor_filter ON vendor_filter.id=vo.vendor_id
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        WHERE vendor_filter.public_id=$1
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND dso.active=true
        ORDER BY vo.updated_at DESC,vo.public_id
        LIMIT $2
      )
      SELECT DISTINCT ON (cv.id)
        cv.public_id AS canonical_public_id,
        cv.family_id::text AS family_id,
        scope.supplier_id::text AS supplier_id,
        scope.external_product_id,
        scope.public_id AS offer_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        c.code AS category_code,
        scope.customer_price_minor,
        scope.msrp_minor,
        scope.cached_quantity,
        (
          scope.cached_available=true
          AND (scope.cached_quantity IS NULL OR scope.cached_quantity>=1)
          AND scope.availability_expires_at IS NOT NULL
          AND scope.availability_expires_at > now()
        ) AS currently_available,
        v.public_id AS vendor_public_id,
        v.trading_name AS vendor_name,
        ds.configuration->'vendorPresentation' AS vendor_presentation,
        cs.code AS source_code,
        cs.website AS source_website,
        COALESCE(csp.source_image_url, source_media.source_url) AS source_image_url
      FROM vendor_scope scope
      JOIN canonical_variants cv ON cv.id=scope.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_businesses v ON v.id=scope.vendor_id
      JOIN vendor_locations l ON l.id=scope.location_id
      JOIN dropship_suppliers ds ON ds.id=scope.supplier_id
      LEFT JOIN catalog_source_products csp ON csp.id=scope.source_product_id
      LEFT JOIN catalog_sources cs ON cs.id=COALESCE(csp.source_id,ds.catalog_source_id)
      LEFT JOIN LATERAL (
        SELECT pm.source_url
        FROM product_media pm
        WHERE pm.canonical_variant_id=cv.id
          AND pm.kind='image'
          AND pm.source_url IS NOT NULL
        ORDER BY pm.sort_order ASC,pm.created_at DESC,pm.id
        LIMIT 1
      ) source_media ON true
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND v.status='active'
        AND l.active=true
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND bls_private.vendor_category_effectively_visible(scope.vendor_id,cv.category_id)
        AND (scope.cost_ceiling_minor IS NULL OR scope.supplier_unit_price_minor<=scope.cost_ceiling_minor)
      ORDER BY cv.id,currently_available DESC,scope.customer_price_minor ASC,scope.availability_checked_at DESC NULLS LAST,scope.updated_at DESC,scope.public_id
    `, [vendorId, VENDOR_STOREFRONT_VARIANT_CAP])
    : await runtime.nativePool.query<PublishedDropshipRow>(`
      SELECT DISTINCT ON (cv.id)
        cv.public_id AS canonical_public_id,
        cv.family_id::text AS family_id,
        dso.supplier_id::text AS supplier_id,
        dso.external_product_id,
        vo.public_id AS offer_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        c.code AS category_code,
        vo.customer_price_minor,
        vo.msrp_minor,
        dso.cached_quantity,
        (
          dso.cached_available=true
          AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at > now()
        ) AS currently_available,
        v.public_id AS vendor_public_id,
        v.trading_name AS vendor_name,
        ds.configuration->'vendorPresentation' AS vendor_presentation,
        cs.code AS source_code,
        cs.website AS source_website,
        COALESCE(csp.source_image_url, source_media.source_url) AS source_image_url
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN catalog_source_products csp ON csp.id=dso.source_product_id
      LEFT JOIN catalog_sources cs ON cs.id=COALESCE(csp.source_id,ds.catalog_source_id)
      LEFT JOIN LATERAL (
        SELECT pm.source_url
        FROM product_media pm
        WHERE pm.canonical_variant_id=cv.id
          AND pm.kind='image'
          AND pm.source_url IS NOT NULL
        ORDER BY pm.sort_order ASC,pm.created_at DESC,pm.id
        LIMIT 1
      ) source_media ON true
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND dso.active=true
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND ($1::text IS NULL OR v.public_id=$1)
        AND ($2::text IS NULL OR cv.public_id=$2)
      ORDER BY cv.id,currently_available DESC,vo.customer_price_minor ASC,dso.availability_checked_at DESC NULLS LAST,vo.updated_at DESC,vo.public_id
    `, [vendorId ?? null, canonicalVariantId ?? null]);

  if (vendorStorefrontScope && result.rows.length >= VENDOR_STOREFRONT_VARIANT_CAP) {
    console.info(JSON.stringify({
      level: "info",
      event: "storefront.dropship_vendor_window_applied",
      vendorId,
      variantCap: VENDOR_STOREFRONT_VARIANT_CAP
    }));
  }

  const base = result.rows.flatMap((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    const msrpMinor = safeMinor(row.msrp_minor);
    if (!priceMinor || !isPublicCatalogueTitle(row.title)) return [];
    const presentation = resolveDropshipPublicFields(
      parseDropshipPresentationConfig(row.vendor_presentation),
      row.offer_public_id
    );
    const available = row.currently_available === true;
    const trustedSourceImage = trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, row.source_image_url);
    return [{
      id: row.canonical_public_id,
      familyId: row.family_id,
      supplierId: row.supplier_id,
      externalProductId: row.external_product_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      priceMinor,
      msrpMinor: msrpMinor !== undefined && msrpMinor > priceMinor ? msrpMinor : null,
      available,
      availableToSell: available ? safeQuantity(row.cached_quantity) : 0,
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      previewImageSrc: trustedSourceImage ? `/api/catalog-source-image/${encodeURIComponent(row.canonical_public_id)}` : undefined,
      publicFields: presentation.fields
    }];
  });
  if (!base.length) return [];

  const ids = base.map((record) => record.id);
  const departmentCodes = await loadCatalogDepartmentCodes(ids);
  const metadata = await loadCatalogMetadata(ids);
  const normalizedQuery = normalizeSearchText(query);
  const selectedSizes = decodeCatalogSizeGroup(filters.size ?? "");

  // Accepted V4 enrichment is projected only after its V4 validator has passed.
  // Supplier/translation content remains the fallback for non-V4 products.
  const enriched = base.map((record) => {
    const details = metadata.get(record.id);
    return {
      ...record,
      title: details?.title ?? record.title,
      departmentCode: departmentCodes.get(record.id),
      sizes: details?.sizes ?? []
    };
  });

  const matching = enriched
    .filter((record) => categoryCodeMatches(record.categoryCode, category, record.departmentCode))
    .filter((record) => {
      const details = metadata.get(record.id);
      if (filters.subcategory && record.categoryCode !== filters.subcategory) return false;
      if (!sameFilterValue(details?.brand, filters.brand)) return false;
      if (!sameFilterValue(details?.color, filters.color)) return false;
      if (selectedSizes.length && !record.sizes.some((size) => selectedSizes.some((selected) => sameFilterValue(size, selected)))) return false;
      if (Object.keys(attributeFilters).length > 0) {
        if (record.publicFields.technicalAttributes === false) return false;
        if (!matchesCatalogAttributeFilters(details?.attributes, attributeFilters)) return false;
      }
      if (!normalizedQuery) return true;
      return searchTextRelevance(normalizedQuery, [
        record.title,
        details?.shortDescription,
        details?.description,
        details?.brand,
        details?.color,
        record.publicFields.mpn === false ? undefined : details?.mpn,
        record.publicFields.gtin === false ? undefined : details?.gtin,
        details?.categoryLabel,
        ...record.sizes,
        record.publicFields.technicalAttributes === false ? undefined : details?.fit,
        record.publicFields.technicalAttributes === false ? undefined : details?.composition,
        record.publicFields.technicalAttributes === false ? undefined : details?.madeIn
      ]) > 0;
    });
  if (!matching.length) return [];

  const projections = projectDropshipFamilies(enriched, new Set(matching.map((record) => record.id)));
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
      event: "storefront.dropship_public_media_projection_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return projections.map((projection) => {
    const record = projection.representative;
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
    const {
      publicFields,
      familyId: _familyId,
      supplierId: _supplierId,
      externalProductId: _externalProductId,
      sizes: _childSizes,
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
      previewImageSrc: image ? undefined : record.previewImageSrc,
      supplierFulfilled: true
    } satisfies CatalogCard & Readonly<{ supplierFulfilled: true }>;
  });
}

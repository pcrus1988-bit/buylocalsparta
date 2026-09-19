import { createHash } from "node:crypto";
import { formatMoney, money } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedCatalogImages } from "./public-media-service";
import { loadCatalogMetadata } from "./catalog-metadata";
import { getPublicProductDetail } from "./public-product-detail";
import { getPublishedDropshipCatalogCards } from "./published-dropship-storefront";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import type { CatalogCard, PublicProductSeoRecord } from "./catalog-view-base";

export * from "./catalog-view-base";

type DirectCanonicalRow = Readonly<{
  id: string;
  slug: string;
  title: string;
  category_code: string;
  department_code: string | null;
  price_minor: number | string;
}>;

type SeoSignalRow = Readonly<{
  offer_available: boolean;
  duplicate_title_count: number | string;
}>;

type CanonicalOfferKindsRow = Readonly<{
  has_dropship_offer: boolean;
  has_local_offer: boolean;
}>;

function safeMinor(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid catalog price from PostgreSQL");
  return parsed;
}

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

/**
 * Product routes resolve exactly one canonical. Department membership is projected
 * by the storefront read model when available, avoiding a second taxonomy query.
 */
type ProductRedirectRow = Readonly<{ to_path: string }>;

async function loadDirectPublicCanonical(routeKey: string) {
  const result = await getProductionPostgresRuntime().nativePool.query<DirectCanonicalRow>(`
    SELECT cv.public_id AS id,
           cv.slug,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
           c.code AS category_code,
           rm.department_code,
           cv.platform_price_minor AS price_minor
    FROM canonical_variants cv
    JOIN markets m ON m.id=cv.market_id
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN public.storefront_catalog_read_model rm ON rm.canonical_variant_id=cv.id
    WHERE (cv.public_id=$1 OR cv.id::text=$1 OR cv.slug=$1)
      AND m.code='sparta'
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND (
        NOT EXISTS (SELECT 1 FROM vendor_offers any_vo WHERE any_vo.canonical_variant_id=cv.id)
        OR EXISTS (
          SELECT 1
          FROM vendor_offers public_vo
          WHERE public_vo.canonical_variant_id=cv.id
            AND public_vo.status NOT IN ('archived','suppressed')
            AND public_vo.merchant_visible=true
            AND public_vo.merchant_pause_active=false
            AND bls_private.vendor_category_effectively_visible(public_vo.vendor_id,cv.category_id)
        )
      )
    LIMIT 1
  `, [routeKey]);
  const row = result.rows[0];
  if (!row || !isPublicCatalogueTitle(String(row.title))) return undefined;
  const priceMinor = safeMinor(row.price_minor);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    priceMinor,
    price: formatMoney(money(priceMinor)),
    categoryCode: String(row.category_code),
    departmentCode: row.department_code ? String(row.department_code) : undefined
  } as const;
}

async function legacyProductRedirectTarget(routeKey: string): Promise<string | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<ProductRedirectRow>(`
    SELECT r.to_path
    FROM public.cms_redirects r
    JOIN public.markets m ON m.id=r.market_id
    WHERE m.code='sparta'
      AND r.active=true
      AND r.status_code IN (301,308)
      AND r.from_path=$1
    ORDER BY r.created_at DESC,r.id DESC
    LIMIT 1
  `, [`/product/${encodeURIComponent(routeKey)}`]);
  const toPath = result.rows[0]?.to_path?.trim();
  if (!toPath?.startsWith("/product/")) return undefined;
  const encodedTarget = toPath.slice("/product/".length);
  if (!encodedTarget) return undefined;
  try {
    return decodeURIComponent(encodedTarget);
  } catch {
    return undefined;
  }
}

/**
 * Product routes stay on the indexed direct lookup. Historical slugs only touch
 * the redirect table after a miss, and the page then emits the permanent redirect.
 */
const directPublicCanonical = cache(async (routeKey: string) => {
  if (!productionDatabaseConfigured()) return undefined;
  const direct = await loadDirectPublicCanonical(routeKey);
  if (direct) return direct;

  const redirectedRouteKey = await legacyProductRedirectTarget(routeKey);
  if (!redirectedRouteKey || redirectedRouteKey === routeKey) return undefined;
  return loadDirectPublicCanonical(redirectedRouteKey);
});

const loadSingleCatalogMetadata = cache(async (canonicalVariantId: string) =>
  (await loadCatalogMetadata([canonicalVariantId])).get(canonicalVariantId)
);

/** SEO-only signals use the storefront projection; checkout/fairness stay authoritative. */
const loadProductSeoSignals = cache(async (canonicalVariantId: string, title: string): Promise<SeoSignalRow> => {
  if (!productionDatabaseConfigured()) return { offer_available: false, duplicate_title_count: 1 };
  const result = await getProductionPostgresRuntime().nativePool.query<SeoSignalRow>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM public.storefront_catalog_read_model rm
        WHERE rm.canonical_public_id=$1
          AND (
            (rm.local_sellable=true AND rm.local_available_until>now())
            OR (rm.dropship_sellable=true AND rm.dropship_available_until>now())
          )
      ) AS offer_available,
      GREATEST(1,(
        SELECT COUNT(*)::int
        FROM public.storefront_catalog_read_model duplicate
        WHERE lower(btrim(duplicate.title))=lower(btrim($2))
      )) AS duplicate_title_count
  `, [canonicalVariantId, title]);
  return result.rows[0] ?? { offer_available: false, duplicate_title_count: 1 };
});

const loadCanonicalOfferKinds = cache(async (canonicalVariantId: string): Promise<CanonicalOfferKindsRow> => {
  if (!productionDatabaseConfigured()) return { has_dropship_offer: false, has_local_offer: false };
  const result = await getProductionPostgresRuntime().nativePool.query<CanonicalOfferKindsRow>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM vendor_offers vo
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        WHERE vo.canonical_variant_id=cv.id
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND dso.active=true
          AND ds.active=true
          AND ds.api_authoritative_availability=true
      ) AS has_dropship_offer,
      EXISTS (
        SELECT 1
        FROM vendor_offers vo
        WHERE vo.canonical_variant_id=cv.id
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND NOT EXISTS (
            SELECT 1
            FROM dropship_supplier_offers dso
            WHERE dso.vendor_offer_id=vo.id
          )
      ) AS has_local_offer
    FROM canonical_variants cv
    WHERE cv.public_id=$1
    LIMIT 1
  `, [canonicalVariantId]);
  return result.rows[0] ?? { has_dropship_offer: false, has_local_offer: false };
});

export const getCanonicalProductSummary = cache(async (routeKey: string) => directPublicCanonical(routeKey));

export const getPublicProductSeoSummary = cache(async (routeKey: string): Promise<PublicProductSeoRecord | undefined> => {
  const product = await directPublicCanonical(routeKey);
  if (!product) return undefined;

  // Cap request-level DB fan-out at three concurrent reads. This matters on the
  // deliberately small serverless pool and prevents metadata generation from
  // starving the page render for a connection.
  const [metadata, detail, signals] = await Promise.all([
    loadSingleCatalogMetadata(product.id),
    getPublicProductDetail(product.id),
    loadProductSeoSignals(product.id, product.title).catch(() => ({ offer_available: false, duplicate_title_count: 1 }))
  ]);
  const images = await approvedCatalogImages([{ canonicalVariantId: product.id }]).catch(() => []);
  const image = images[0];
  const displayTitle = metadata?.title ?? product.title;
  return {
    ...product,
    title: displayTitle,
    description: metadata?.description ?? detail?.description,
    brand: metadata?.brand ?? detail?.brand,
    gtin: metadata?.gtin ?? detail?.sourceGtin,
    mpn: metadata?.mpn,
    categoryLabel: metadata?.categoryLabel,
    color: metadata?.color,
    sizes: metadata?.sizes ?? [],
    mediaId: image?.mediaId,
    mediaAlt: image?.altText,
    sourceImageAvailable: Boolean(detail?.sourceImageUrl),
    offerAvailable: Boolean(signals.offer_available),
    duplicateTitleCount: Math.max(1, Number(signals.duplicate_title_count) || 1)
  };
});

async function assignedOfferPrice(canonicalVariantId: string, visitorKey: string, postcode: string, vendorId: string): Promise<number | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<{ customer_price_minor: number | string }>(`
    SELECT vo.customer_price_minor
    FROM sticky_assignments sa
    JOIN canonical_variants cv ON cv.id=sa.canonical_variant_id
    JOIN vendor_offers vo ON vo.id=sa.offer_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    WHERE cv.public_id=$1
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND sa.visitor_hash=$2
      AND sa.postcode_scope=$3
      AND sa.released_at IS NULL
      AND sa.expires_at>now()
      AND vo.status='approved'
      AND v.public_id=$4
    ORDER BY sa.locked_at DESC
    LIMIT 1
  `, [canonicalVariantId, visitorHash(visitorKey), postcode, vendorId]);
  const row = result.rows[0];
  return row ? safeMinor(row.customer_price_minor) : undefined;
}

/** Fast single-product card projection for /product/[id]. */
export async function getCatalogCard(id: string, visitorKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const canonical = await directPublicCanonical(id);
  if (!canonical) return undefined;

  // Supplier-only products do not participate in local pickup fairness. Going
  // through publicAssignedCanonical first forces a serializable local-inventory
  // lookup that can time out as the supplier catalogue grows. Resolve the
  // supplier projection directly, while preserving the existing local-first
  // behaviour for canonicals that genuinely have both local and dropship offers.
  const offerKinds = await loadCanonicalOfferKinds(canonical.id);
  if (offerKinds.has_dropship_offer && !offerKinds.has_local_offer) {
    const dropshipProduct = (await getPublishedDropshipCatalogCards("", "", {}, {}, undefined, canonical.id))[0];
    if (dropshipProduct) return dropshipProduct;
  }

  const runtime = getProductionPostgresRuntime();
  const assigned = await runtime.customerCommerce.publicAssignedCanonical({ canonicalVariantId: canonical.id, visitorKey, postcode, reason: "product_view" });
  if (!assigned || !isPublicCatalogueTitle(assigned.title)) {
    return (await getPublishedDropshipCatalogCards("", "", {}, {}, undefined, canonical.id))[0];
  }

  let priceMinor = assigned.priceMinor;
  if (assigned.available && assigned.vendorId) {
    const offerPrice = await assignedOfferPrice(canonical.id, visitorKey, postcode, assigned.vendorId);
    if (offerPrice !== undefined) priceMinor = offerPrice;
  }

  const [metadata, images] = await Promise.all([
    loadSingleCatalogMetadata(canonical.id),
    approvedCatalogImages([{ canonicalVariantId: canonical.id, preferredVendorId: assigned.vendorId }]).catch(() => [])
  ]);
  const image = images[0];
  const localProduct: CatalogCard = {
    id: canonical.id,
    slug: canonical.slug,
    title: metadata?.title ?? assigned.title,
    priceMinor,
    price: formatMoney(money(priceMinor)),
    categoryCode: assigned.categoryCode,
    departmentCode: canonical.departmentCode,
    categoryLabel: metadata?.categoryLabel,
    gtin: metadata?.gtin,
    mpn: metadata?.mpn,
    description: metadata?.description,
    brand: metadata?.brand,
    brandLogoObjectKey: metadata?.brandLogoObjectKey,
    color: metadata?.color,
    sizes: metadata?.sizes ?? [],
    fit: metadata?.fit,
    composition: metadata?.composition,
    madeIn: metadata?.madeIn,
    vendorId: assigned.vendorId,
    vendorName: assigned.vendorName,
    adviser: assigned.adviser,
    mediaId: image?.mediaId,
    mediaAlt: image?.altText,
    availableToSell: assigned.availableToSell,
    available: assigned.available
  };

  if (localProduct.available && localProduct.availableToSell > 0 && localProduct.priceMinor > 0 && localProduct.vendorId) return localProduct;
  const dropshipProduct = (await getPublishedDropshipCatalogCards("", "", {}, {}, undefined, canonical.id))[0];
  return dropshipProduct ?? localProduct;
}

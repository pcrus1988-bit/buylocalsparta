import { createHash } from "node:crypto";
import { formatMoney, money } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedCatalogImages } from "./public-media-service";
import { loadCatalogMetadata } from "./catalog-metadata";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
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
  price_minor: number | string;
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
 * Product detail routes must never materialize the full public catalogue. With
 * 60k+ canonicals that path caused statement timeouts and exhausted the small
 * serverless connection pool. Resolve exactly one public canonical instead.
 */
const directPublicCanonical = cache(async (routeKey: string) => {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().nativePool.query<DirectCanonicalRow>(`
    SELECT cv.public_id AS id,
           cv.slug,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
           c.code AS category_code,
           cv.platform_price_minor AS price_minor
    FROM canonical_variants cv
    JOIN markets m ON m.id=cv.market_id
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
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
  const departmentCodes = await loadCatalogDepartmentCodes([String(row.id)]);
  const priceMinor = safeMinor(row.price_minor);
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    priceMinor,
    price: formatMoney(money(priceMinor)),
    categoryCode: String(row.category_code),
    departmentCode: departmentCodes.get(String(row.id))
  } as const;
});

async function stableOfferAvailable(canonicalVariantId: string): Promise<boolean> {
  if (!productionDatabaseConfigured()) return false;
  const result = await getProductionPostgresRuntime().nativePool.query<{ available: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      LEFT JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id AND dso.active=true
      LEFT JOIN dropship_suppliers ds ON ds.id=dso.supplier_id AND ds.active=true
      WHERE cv.public_id=$1
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND m.code='sparta'
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND (
          (dso.id IS NOT NULL
            AND ds.api_authoritative_availability=true
            AND dso.cached_available=true
            AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
            AND dso.availability_expires_at IS NOT NULL
            AND dso.availability_expires_at>now())
          OR
          (dso.id IS NULL
            AND ib.offer_id IS NOT NULL
            AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
            AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now())
        )
    ) AS available
  `, [canonicalVariantId]);
  return Boolean(result.rows[0]?.available);
}

async function duplicateTitleCount(title: string): Promise<number> {
  if (!productionDatabaseConfigured()) return 1;
  const result = await getProductionPostgresRuntime().nativePool.query<{ count: number | string }>(`
    SELECT COUNT(*)::int AS count
    FROM canonical_variants cv
    JOIN markets m ON m.id=cv.market_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE m.code='sparta'
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND LOWER(BTRIM(COALESCE(el.title,en.title,cv.model,cv.slug)))=LOWER(BTRIM($1))
  `, [title]);
  return Math.max(1, Number(result.rows[0]?.count ?? 1));
}

export const getCanonicalProductSummary = cache(async (routeKey: string) => directPublicCanonical(routeKey));

export const getPublicProductSeoSummary = cache(async (routeKey: string): Promise<PublicProductSeoRecord | undefined> => {
  const product = await directPublicCanonical(routeKey);
  if (!product) return undefined;
  const [metadataMap, detail, offerAvailable, duplicates, images] = await Promise.all([
    loadCatalogMetadata([product.id]),
    getPublicProductDetail(product.id),
    stableOfferAvailable(product.id).catch(() => false),
    duplicateTitleCount(product.title).catch(() => 1),
    approvedCatalogImages([{ canonicalVariantId: product.id }]).catch(() => [])
  ]);
  const metadata = metadataMap.get(product.id);
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
    offerAvailable,
    duplicateTitleCount: duplicates
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
  const runtime = getProductionPostgresRuntime();
  const assigned = await runtime.customerCommerce.publicAssignedCanonical({ canonicalVariantId: canonical.id, visitorKey, postcode, reason: "product_view" });
  if (!assigned || !isPublicCatalogueTitle(assigned.title)) return undefined;

  let priceMinor = assigned.priceMinor;
  if (assigned.available && assigned.vendorId) {
    const offerPrice = await assignedOfferPrice(canonical.id, visitorKey, postcode, assigned.vendorId);
    if (offerPrice !== undefined) priceMinor = offerPrice;
  }

  const [metadataMap, images] = await Promise.all([
    loadCatalogMetadata([canonical.id]),
    approvedCatalogImages([{ canonicalVariantId: canonical.id, preferredVendorId: assigned.vendorId }]).catch(() => [])
  ]);
  const metadata = metadataMap.get(canonical.id);
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

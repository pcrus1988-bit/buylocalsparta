import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getPublicProductDetails } from "./public-product-detail";
import { approvedCatalogImages } from "./public-media-service";

type LocalCardRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  available_to_sell: number | string;
  vendor_public_id: string;
  vendor_name: string;
}>;

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Exact, read-only local product projection for crawler product requests. */
export async function getCrawlerLocalCatalogCard(routeKey: string): Promise<CatalogCard | undefined> {
  const key = routeKey.trim();
  if (!key || !productionDatabaseConfigured()) return undefined;

  const result = await getProductionPostgresRuntime().nativePool.query<LocalCardRow>(`
    SELECT
      cv.public_id AS canonical_public_id,
      cv.slug,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      c.code AS category_code,
      vo.customer_price_minor,
      GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::integer AS available_to_sell,
      v.public_id AS vendor_public_id,
      v.trading_name AS vendor_name
    FROM canonical_variants cv
    JOIN markets m ON m.id=cv.market_id
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN inventory_balances ib ON ib.offer_id=vo.id
    WHERE (cv.public_id=$1 OR cv.slug=$1)
      AND m.code='sparta'
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND v.status='active'
      AND l.active=true
      AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
      AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
    ORDER BY ib.stock_confirmed_at DESC,vo.customer_price_minor,vo.public_id
    LIMIT 1
  `,[key]);

  const row = result.rows[0];
  if (!row) return undefined;
  const priceMinor = positiveInt(row.customer_price_minor);
  const availableToSell = positiveInt(row.available_to_sell);
  if (!priceMinor || !availableToSell) return undefined;

  const id = row.canonical_public_id;
  const [metadata, departmentCodes, sourceDetails] = await Promise.all([
    loadCatalogMetadata([id]),
    loadCatalogDepartmentCodes([id]),
    getPublicProductDetails([id])
  ]);
  const details = metadata.get(id);
  const sourceDetail = sourceDetails.get(id);
  let image: Awaited<ReturnType<typeof approvedCatalogImages>>[number] | undefined;
  try {
    image = (await approvedCatalogImages([{ canonicalVariantId: id, preferredVendorId: row.vendor_public_id }]))[0];
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "crawler.product_media_projection_failed",
      canonicalVariantId: id,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return {
    id,
    slug: row.slug,
    title: details?.title ?? row.title,
    priceMinor,
    price: formatMoney(money(priceMinor)),
    categoryCode: row.category_code,
    departmentCode: departmentCodes.get(id),
    categoryLabel: details?.categoryLabel,
    gtin: details?.gtin ?? sourceDetail?.sourceGtin,
    mpn: details?.mpn,
    description: details?.description ?? sourceDetail?.description,
    brand: details?.brand ?? sourceDetail?.brand,
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
    sourceImageAvailable: Boolean(sourceDetail?.sourceImageUrl),
    available: true,
    availableToSell
  };
}

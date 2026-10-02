import { unstable_cache } from "next/cache";
import { loadCatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";
import type { SportAudience, SportFitProduct } from "./sport-fit-engine";

type SportCatalogRow = Readonly<{
  id: string;
  slug: string;
  title: string;
  category_code: string;
  price_minor: number | string;
  available_to_sell: number | string;
  vendor_id: string;
  vendor_name: string;
  preview_image_src: string | null;
  source_code: string | null;
  source_website: string | null;
}>;

export type SportFitCatalogSnapshot = Readonly<{
  vendorId: string;
  vendorName: string;
  products: readonly SportFitProduct[];
}>;

const COMMON_CATEGORIES = [
  "socks-hosiery",
  "sports-clothing",
  "fitness-accessories",
  "team-sports-equipment"
] as const;

const CATEGORY_SCOPE: Readonly<Record<SportAudience, readonly string[]>> = {
  men: [
    ...COMMON_CATEGORIES,
    "mens-running-shoes",
    "mens-sneakers",
    "fashion-mens-activewear",
    "fashion-mens-tshirts-tops",
    "fashion-mens-shorts",
    "fashion-mens-trousers-jeans"
  ],
  women: [
    ...COMMON_CATEGORIES,
    "womens-running-shoes",
    "womens-sneakers",
    "fashion-womens-activewear",
    "fashion-womens-tops",
    "fashion-womens-shorts",
    "fashion-womens-trousers-jeans"
  ],
  kids: [
    ...COMMON_CATEGORIES,
    "kids-running-shoes",
    "kids-sneakers"
  ]
};

function safeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeVendorId(value: string): string {
  const vendorId = value.trim();
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(vendorId)) throw new Error("INVALID_VENDOR");
  return vendorId;
}

async function readSportFitCatalog(vendorId: string, audience: SportAudience): Promise<SportFitCatalogSnapshot> {
  if (!productionDatabaseConfigured()) return { vendorId, vendorName: "", products: [] };

  const categories = CATEGORY_SCOPE[audience];
  const result = await getProductionPostgresRuntime().nativePool.query<SportCatalogRow>(`
    SELECT
      cv.public_id AS id,
      cv.slug,
      COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),NULLIF(cv.model,''),NULLIF(pf.model,''),cv.slug) AS title,
      c.code AS category_code,
      vo.customer_price_minor AS price_minor,
      GREATEST(
        0,
        COALESCE(ib.on_hand,0)
          - COALESCE(ib.active_reservations,0)
          - COALESCE(ib.safety_stock,0)
          - COALESCE(ib.blocked,0)
      ) AS available_to_sell,
      v.public_id AS vendor_id,
      COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
      media.source_url AS preview_image_src,
      media.source_code,
      media.source_website
    FROM vendor_businesses v
    JOIN vendor_offers vo ON vo.vendor_id=v.id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    LEFT JOIN product_families pf ON pf.id=cv.family_id
    JOIN categories c ON c.id=cv.category_id
    JOIN inventory_balances ib ON ib.offer_id=vo.id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN LATERAL (
      SELECT pm.source_url,cs.code AS source_code,cs.website AS source_website
      FROM product_media pm
      JOIN catalog_sources cs ON cs.id=pm.source_id AND cs.active=true
      WHERE pm.canonical_variant_id=cv.id
        AND pm.vendor_id=v.id
        AND pm.kind='image'
        AND pm.scan_status='clean'
        AND pm.rights_status='approved'
        AND pm.moderation_status='approved'
        AND pm.source_url IS NOT NULL
      ORDER BY pm.sort_order ASC,pm.created_at ASC,pm.id
      LIMIT 1
    ) media ON true
    WHERE v.public_id=$1
      AND v.status='active'
      AND c.code=ANY($2::text[])
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND l.active=true
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
      AND GREATEST(
        0,
        COALESCE(ib.on_hand,0)
          - COALESCE(ib.active_reservations,0)
          - COALESCE(ib.safety_stock,0)
          - COALESCE(ib.blocked,0)
      )>=1
      AND ib.stock_confirmed_at IS NOT NULL
      AND ib.stock_confirmed_at + make_interval(secs=>COALESCE(ib.freshness_ttl_seconds,0))>now()
    ORDER BY
      CASE
        WHEN c.code LIKE '%running-shoes' THEN 0
        WHEN c.code LIKE '%sneakers' THEN 1
        WHEN c.code='socks-hosiery' THEN 2
        WHEN c.code LIKE '%activewear' THEN 3
        ELSE 4
      END,
      vo.updated_at DESC,
      cv.public_id
    LIMIT 320
  `, [safeVendorId(vendorId), [...categories]]);

  if (result.rows.length === 0) return { vendorId, vendorName: "", products: [] };

  const metadata = await loadCatalogMetadata(result.rows.map((row) => row.id));
  const products = result.rows.flatMap((row): readonly SportFitProduct[] => {
    const details = metadata.get(row.id);
    const priceMinor = safeInt(row.price_minor);
    const availableToSell = safeInt(row.available_to_sell);
    if (!priceMinor || !availableToSell) return [];

    return [{
      id: row.id,
      slug: row.slug,
      title: details?.title ?? row.title,
      priceMinor,
      categoryCode: row.category_code,
      categoryLabel: details?.categoryLabel,
      brand: details?.brand,
      color: details?.color,
      sizes: details?.sizes ?? [],
      fit: details?.fit,
      description: details?.description,
      attributes: details?.attributes ?? {},
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      previewImageSrc: trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, row.preview_image_src),
      available: true,
      availableToSell
    }];
  });

  return {
    vendorId,
    vendorName: result.rows[0]?.vendor_name ?? "",
    products
  };
}

const cachedSportFitCatalog = unstable_cache(
  readSportFitCatalog,
  ["sport-fit-catalog-v1"],
  { revalidate: 30 }
);

export async function getSportFitCatalog(vendorId: string, audience: SportAudience): Promise<SportFitCatalogSnapshot> {
  return cachedSportFitCatalog(safeVendorId(vendorId), audience);
}

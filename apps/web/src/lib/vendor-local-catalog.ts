import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata } from "./catalog-metadata";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type LocalVendorCatalogRow = Readonly<{
  id: string;
  slug: string;
  title: string;
  category_code: string;
  price_minor: number | string;
  available_to_sell: number | string;
  vendor_id: string;
  vendor_name: string;
}>;

export type VendorLocalCatalogPage = Readonly<{
  products: readonly CatalogCard[];
  total: number;
  offset: number;
  limit: number;
}>;

function safeMinor(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Public vendor-storefront projection for non-dropship catalogue rows.
 *
 * It deliberately includes two states:
 *  1. approved local offers, with their physical inventory signal;
 *  2. Admin-assigned VITEX assortment rows that are still awaiting commercial/
 *     stock confirmation.
 *
 * State (2) is storefront-visible only inside the specific vendor page. It does
 * not enter /shop, fairness assignment or checkout until an approved offer and
 * authoritative stock exist. This keeps "assigned to this shop" distinct from
 * "purchasable now" without making the assigned catalogue disappear.
 */
async function loadVendorLocalCatalogRows(vendorId: string): Promise<readonly LocalVendorCatalogRow[]> {
  if (!productionDatabaseConfigured()) return [];

  const pool = getProductionPostgresRuntime().nativePool;
  const result = await pool.query<LocalVendorCatalogRow>(`
    WITH approved_local AS (
      SELECT
        cv.public_id AS id,
        cv.slug,
        COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),NULLIF(cv.model,''),NULLIF(pf.model,''),cv.slug) AS title,
        COALESCE(c.code,'other') AS category_code,
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
        vo.updated_at,
        0 AS source_rank
      FROM vendor_businesses v
      JOIN vendor_offers vo ON vo.vendor_id=v.id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE v.public_id=$1
        AND v.status='active'
        AND dso.id IS NULL
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND vo.status='approved'
        AND COALESCE(vo.merchant_visible,true)=true
        AND COALESCE(vo.merchant_pause_active,false)=false
        AND l.active=true
        AND vo.customer_price_minor IS NOT NULL
        AND vo.customer_price_minor>0
    ),
    assigned_vitex AS (
      SELECT
        cv.public_id AS id,
        cv.slug,
        COALESCE(NULLIF(el.title,''),NULLIF(en.title,''),NULLIF(cv.model,''),cv.slug) AS title,
        COALESCE(c.code,'other') AS category_code,
        vcp.price_minor AS price_minor,
        0::bigint AS available_to_sell,
        v.public_id AS vendor_id,
        COALESCE(NULLIF(v.trading_name,''),v.legal_name) AS vendor_name,
        vca.updated_at,
        1 AS source_rank
      FROM vendor_catalog_assortments vca
      JOIN vendor_businesses v ON v.id=vca.vendor_id
      JOIN vendor_locations l ON l.id=vca.location_id
      JOIN catalog_source_products csp ON csp.id=vca.source_product_id
      JOIN catalog_sources cs ON cs.id=csp.source_id
      JOIN vitex_commerce_products vcp
        ON vcp.import_fingerprint=csp.source_product_key
       AND vcp.active=true
      JOIN canonical_variants cv ON cv.id=vcp.canonical_variant_id
      LEFT JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE v.public_id=$1
        AND v.status='active'
        AND l.active=true
        AND cs.code='vitex-commerce-media'
        AND cs.active=true
        AND vca.assortment_status NOT IN ('rejected','discontinued')
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND vcp.price_minor>0
    ),
    combined AS (
      SELECT * FROM approved_local
      UNION ALL
      SELECT * FROM assigned_vitex
    )
    SELECT DISTINCT ON (id)
      id,slug,title,category_code,price_minor,available_to_sell,vendor_id,vendor_name
    FROM combined
    ORDER BY id,source_rank,updated_at DESC
  `, [vendorId]);

  return result.rows.filter((row) => row.id && row.slug && isPublicCatalogueTitle(row.title));
}

async function hydrateVendorLocalCatalogRows(
  vendorId: string,
  rows: readonly LocalVendorCatalogRow[]
): Promise<readonly CatalogCard[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  // The Vercel web runtime intentionally keeps a single PostgreSQL connection
  // per instance. Run DB-backed projections sequentially so one catalogue request
  // never queues multiple acquisitions behind its own pool slot during traffic bursts.
  const metadata = await loadCatalogMetadata(ids);
  const departmentCodes = await loadCatalogDepartmentCodes(ids);

  let imagesByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(rows.map((row) => ({
      canonicalVariantId: row.id,
      preferredVendorId: vendorId
    })));
    imagesByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.vendor_local_media_projection_failed",
      vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return rows.map((row) => {
    const details = metadata.get(row.id);
    const image = imagesByCanonical.get(row.id);
    const priceMinor = safeMinor(row.price_minor);
    const availableToSell = safeMinor(row.available_to_sell);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      priceMinor,
      price: formatMoney(money(priceMinor)),
      categoryCode: row.category_code,
      departmentCode: departmentCodes.get(row.id),
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
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      availableToSell,
      available: availableToSell > 0
    } satisfies CatalogCard;
  });
}


function boundedInt(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
}

/**
 * Latency-critical local slice for the unfiltered vendor storefront.
 *
 * We still inspect the small vendor-local identity set so local/dropship offsets
 * remain deterministic, but only the rows that will actually be rendered are
 * hydrated with catalogue metadata and media. The previous path hydrated every
 * assigned local item on every supplier page just to learn the local row count.
 */
export async function getVendorLocalCatalogPage(
  vendorId: string,
  input: Readonly<{ offset?: number; limit?: number; availableOnly?: boolean }> = {}
): Promise<VendorLocalCatalogPage> {
  const offset = boundedInt(input.offset, 0, 100_000);
  const limit = Math.max(1, boundedInt(input.limit, 20, 60));
  const rows = await loadVendorLocalCatalogRows(vendorId);
  const filtered = input.availableOnly
    ? rows.filter((row) => safeMinor(row.available_to_sell) > 0)
    : rows;
  const sorted = [...filtered].sort((left, right) =>
    Number(safeMinor(right.available_to_sell) > 0) - Number(safeMinor(left.available_to_sell) > 0)
      || left.title.localeCompare(right.title, "el")
  );
  const pageRows = sorted.slice(offset, Math.min(sorted.length, offset + limit));
  const products = await hydrateVendorLocalCatalogRows(vendorId, pageRows);
  return { products, total: sorted.length, offset, limit };
}

export async function getVendorLocalCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  const rows = await loadVendorLocalCatalogRows(vendorId);
  return hydrateVendorLocalCatalogRows(vendorId, rows);
}

import { unstable_cache } from "next/cache";
import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata } from "./catalog-metadata";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { approvedCatalogImages } from "./public-media-service";
import { trustedCatalogSourceHttpsUrl } from "./trusted-catalog-source-url";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { isDropshippingOnlyVendorPublicId } from "./vendor-dropshipping-constants";

type LocalVendorCatalogRow = Readonly<{
  id: string;
  slug: string;
  title: string;
  category_code: string;
  price_minor: number | string;
  available_to_sell: number | string;
  vendor_id: string;
  vendor_name: string;
  feed_group_key: string | null;
  variant_size: string | null;
  preview_image_src: string | null;
  source_code: string | null;
  source_website: string | null;
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
async function readVendorLocalCatalogRows(vendorId: string): Promise<readonly LocalVendorCatalogRow[]> {
  // This vendor is intentionally dropshipping-only. Avoid running the large local/VITEX
  // catalogue query just to prove that no local rows exist; on a one-client Vercel pool
  // that unnecessary work can block the storefront request behind itself.
  if (isDropshippingOnlyVendorPublicId(vendorId)) return [];
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
        feed_item.feed_group_key,
        feed_item.variant_size,
        media.source_url AS preview_image_src,
        media.source_code,
        media.source_website,
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
      LEFT JOIN LATERAL (
        SELECT i.feed_id::text||':'||btrim(i.source_payload->>'itemGroupId') AS feed_group_key,
               NULLIF(btrim(i.source_payload->>'size'),'') AS variant_size
        FROM vendor_product_feed_items i
        WHERE i.vendor_id=v.id
          AND i.canonical_variant_id=cv.id
          AND i.state='present'
          AND NULLIF(btrim(i.source_payload->>'itemGroupId'),'') IS NOT NULL
        ORDER BY i.last_seen_at DESC,i.updated_at DESC,i.id DESC
        LIMIT 1
      ) feed_item ON true
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
        AND COALESCE(vo.source_payload->>'dropship','false') <> 'true'
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
        NULL::text AS feed_group_key,
        NULL::text AS variant_size,
        NULL::text AS preview_image_src,
        NULL::text AS source_code,
        NULL::text AS source_website,
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
      id,slug,title,category_code,price_minor,available_to_sell,vendor_id,vendor_name,
      feed_group_key,variant_size,preview_image_src,source_code,source_website
    FROM combined
    ORDER BY id,source_rank,updated_at DESC
  `, [vendorId]);

  return result.rows.filter((row) => row.id && row.slug && isPublicCatalogueTitle(row.title));
}

const loadVendorLocalCatalogRows = unstable_cache(
  readVendorLocalCatalogRows,
  ["vendor-local-catalog-rows-v3"],
  { revalidate: 15 }
);

type GroupedLocalVendorCatalogRow = LocalVendorCatalogRow & Readonly<{
  variant_sizes: readonly string[];
}>;

function decodeNumericTitleEntities(value: string): string {
  return value.replace(/&#(?:(\d+)|x([0-9a-f]+));/gi, (match, decimal: string | undefined, hex: string | undefined) => {
    const codePoint = Number.parseInt(decimal ?? hex ?? "", hex ? 16 : 10);
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
    if (codePoint === 9 || codePoint === 10 || codePoint === 13) return " ";
    if (codePoint < 32) return "";
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
}

function escapeRegExp(value: string): string {
  const special = "\\^$.*+?()[]{}|";
  return [...value].map((character) => special.includes(character) ? "\\" + character : character).join("");
}

function familyCardTitle(title: string, size: string | null): string {
  const clean = decodeNumericTitleEntities(title).replace(/\s+/g, " ").trim();
  if (!size) return clean;
  return clean.replace(new RegExp("\\s+-\\s+" + escapeRegExp(size) + "\\s*$", "i"), "").trim();
}

function preferredFamilyRepresentative(left: LocalVendorCatalogRow, right: LocalVendorCatalogRow): LocalVendorCatalogRow {
  const leftAvailable = safeMinor(left.available_to_sell) > 0;
  const rightAvailable = safeMinor(right.available_to_sell) > 0;
  if (leftAvailable !== rightAvailable) return rightAvailable ? right : left;

  const leftPrice = safeMinor(left.price_minor);
  const rightPrice = safeMinor(right.price_minor);
  if (leftPrice !== rightPrice) return rightPrice < leftPrice ? right : left;

  const titleOrder = left.title.localeCompare(right.title, "el", { numeric: true, sensitivity: "base" });
  if (titleOrder !== 0) return titleOrder <= 0 ? left : right;
  return left.id <= right.id ? left : right;
}

/**
 * XML feed rows remain exact variant-level inventory identities, while the vendor
 * storefront is family-level discovery. Collapse only rows sharing the same current
 * feed + item_group_id, so manual products and unrelated canonicals are untouched.
 */
function collapseVendorFeedVariants(rows: readonly LocalVendorCatalogRow[]): readonly GroupedLocalVendorCatalogRow[] {
  const groups = new Map<string, {
    representative: LocalVendorCatalogRow;
    availableToSell: number;
    sizes: Set<string>;
  }>();

  for (const row of rows) {
    const key = row.feed_group_key ?? "canonical:" + row.id;
    const size = row.variant_size?.trim();
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        representative: row,
        availableToSell: safeMinor(row.available_to_sell),
        sizes: new Set(size ? [size] : [])
      });
      continue;
    }

    existing.representative = preferredFamilyRepresentative(existing.representative, row);
    existing.availableToSell = Math.max(existing.availableToSell, safeMinor(row.available_to_sell));
    if (size) existing.sizes.add(size);
  }

  return [...groups.values()].map(({ representative, availableToSell, sizes }) => ({
    ...representative,
    title: familyCardTitle(representative.title, representative.variant_size),
    available_to_sell: availableToSell,
    variant_sizes: [...sizes].sort((left, right) => left.localeCompare(right, "el", { numeric: true, sensitivity: "base" }))
  }));
}

async function hydrateVendorLocalCatalogRows(
  vendorId: string,
  rows: readonly GroupedLocalVendorCatalogRow[]
): Promise<readonly CatalogCard[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  // Vercel web instances intentionally use one PostgreSQL client. Keep
  // DB-backed hydration sequential so this request never queues behind itself.
  const metadata = await loadCatalogMetadata(ids);
  const departmentCodes = await loadCatalogDepartmentCodes(ids);

  const previewImages = new Map<string, string>();
  for (const row of rows) {
    const preview = trustedCatalogSourceHttpsUrl(row.source_code, row.source_website, row.preview_image_src);
    if (preview) previewImages.set(row.id, preview);
  }

  let imagesByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  const rowsNeedingStoredMedia = rows.filter((row) => !previewImages.has(row.id));
  if (rowsNeedingStoredMedia.length > 0) {
    try {
      const images = await approvedCatalogImages(rowsNeedingStoredMedia.map((row) => ({
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
      sizes: row.variant_sizes.length ? row.variant_sizes : details?.sizes ?? [],
      fit: details?.fit,
      composition: details?.composition,
      madeIn: details?.madeIn,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      previewImageSrc: previewImages.get(row.id),
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
async function readVendorLocalCatalogPage(
  vendorId: string,
  offset: number,
  limit: number,
  availableOnly: boolean
): Promise<VendorLocalCatalogPage> {
  const rows = collapseVendorFeedVariants(await loadVendorLocalCatalogRows(vendorId));
  const filtered = availableOnly
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

const cachedVendorLocalCatalogPage = unstable_cache(
  readVendorLocalCatalogPage,
  ["vendor-local-catalog-page-v2"],
  { revalidate: 15 }
);

export async function getVendorLocalCatalogPage(
  vendorId: string,
  input: Readonly<{ offset?: number; limit?: number; availableOnly?: boolean }> = {}
): Promise<VendorLocalCatalogPage> {
  const offset = boundedInt(input.offset, 0, 100_000);
  const limit = Math.max(1, boundedInt(input.limit, 20, 60));
  return cachedVendorLocalCatalogPage(vendorId, offset, limit, input.availableOnly === true);
}

export async function getVendorLocalCatalogFacetCards(vendorId: string): Promise<readonly CatalogCard[]> {
  const rows = collapseVendorFeedVariants(await loadVendorLocalCatalogRows(vendorId));
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  // Vercel web instances intentionally use one PostgreSQL client. Keep
  // DB-backed hydration sequential so this request never queues behind itself.
  const metadata = await loadCatalogMetadata(ids);
  const departmentCodes = await loadCatalogDepartmentCodes(ids);

  // Facet-only requests never render product cards, so do not resolve media for
  // the entire local/VITEX assortment. On mixed local + large dropship vendors
  // that unnecessary image projection was dominating the guide request latency.
  return rows.map((row) => {
    const details = metadata.get(row.id);
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
      sizes: row.variant_sizes.length ? row.variant_sizes : details?.sizes ?? [],
      fit: details?.fit,
      composition: details?.composition,
      madeIn: details?.madeIn,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      availableToSell,
      available: availableToSell > 0
    } satisfies CatalogCard;
  });
}

export async function getVendorLocalCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  const rows = collapseVendorFeedVariants(await loadVendorLocalCatalogRows(vendorId));
  return hydrateVendorLocalCatalogRows(vendorId, rows);
}

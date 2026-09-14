import { formatMoney, money, normalizeSearchText } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters, PublicProductSeoRecord } from "./catalog-view";
import { getPublicProductSeoInventory, getPublicProductSeoSummary } from "./catalog-view";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { loadCatalogMetadata, type CatalogMetadata } from "./catalog-metadata";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { categoryCodeMatches } from "./storefront-taxonomy";

export type CrawlerCatalogFilters = CatalogFilters & Readonly<{ fit?: string }>;

type PublicOfferPreview = Readonly<{
  available: boolean;
  availableToSell: number;
  customerPriceMinor?: number;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
}>;

type PublicOfferPreviewRow = Readonly<{
  customer_price_minor: number | string;
  available_to_sell: number | string;
  vendor_public_id: string;
  vendor_name: string;
  adviser_name: string | null;
}>;

type CrawlerHomepageCandidateRow = Readonly<{
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  customer_price_minor: number | string;
  available_to_sell: number | string;
  vendor_public_id: string;
  vendor_name: string;
  freshness: Date | string | null;
}>;

type CrawlerHomepageCandidate = Readonly<{
  id: string;
  slug: string;
  title: string;
  categoryCode: string;
  priceMinor: number;
  availableToSell: number;
  vendorId: string;
  vendorName: string;
  freshness: number;
}>;

const CRAWLER_PREVIEW_BATCH_SIZE = 8;
const CRAWLER_LIMIT_SCAN_MULTIPLIER = 2;
const CRAWLER_MIN_LIMIT_SCAN = 24;
const CRAWLER_HOMEPAGE_MIN_SOURCE_SCAN = 64;
const CRAWLER_HOMEPAGE_MAX_SOURCE_SCAN = 256;

function sameFilterValue(left: string | undefined, right: string | undefined): boolean {
  if (!right) return true;
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

function matchesQuery(product: PublicProductSeoRecord, query: string): boolean {
  if (!query) return true;
  return [product.title, product.description, product.brand, product.color, product.gtin, product.mpn, product.categoryLabel]
    .some((value) => normalizeSearchText(value ?? "").includes(query));
}

function safeMinor(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function epoch(value: Date | string | null): number {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Select one currently eligible pickup offer without mutating fairness state.
 * This is deliberately a public preview, not a customer assignment: it does not touch
 * fairness_rotation_state, sticky_assignments, qualified_exposures or assignment events.
 * The returned price/vendor are nevertheless real, currently eligible public commerce data,
 * keeping crawler-visible content materially aligned with what a customer can receive.
 *
 * The commerce-channel predicate is intentionally repeated here even though callers are
 * fed by the normal-only SEO inventory. It is a defense-in-depth boundary: an internal
 * refactor must never make BAZAAR inventory eligible for the normal crawler projection.
 */
async function readOnlyOfferPreview(canonicalVariantId: string, postcode: string, now = Date.now()): Promise<PublicOfferPreview> {
  const result = await getProductionPostgresRuntime().nativePool.query<PublicOfferPreviewRow>(`
    SELECT vo.customer_price_minor,
           GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::integer AS available_to_sell,
           v.public_id AS vendor_public_id,
           v.trading_name AS vendor_name,
           adviser.name AS adviser_name
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN markets m ON m.id=cv.market_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN inventory_balances ib ON ib.offer_id=vo.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(NULLIF(ap.display_name,''),'Local adviser') AS name
      FROM adviser_profiles ap
      JOIN vendor_users vu ON vu.id=ap.vendor_user_id
      WHERE vu.vendor_id=v.id AND vu.active=true AND ap.active=true
      ORDER BY ap.created_at,ap.public_id
      LIMIT 1
    ) adviser ON true
    LEFT JOIN LATERAL (
      SELECT r.max_open_fulfilments
      FROM fulfilment_capacity_rules r
      WHERE r.vendor_id=vo.vendor_id
        AND r.location_id=vo.location_id
        AND r.mode='pickup'
        AND r.active=true
        AND r.starts_at <= $3
        AND (r.ends_at IS NULL OR r.ends_at > $3)
      ORDER BY r.priority DESC,r.starts_at DESC,r.public_id
      LIMIT 1
    ) cap ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS open_count
      FROM fulfilment_orders fo
      JOIN customer_orders co ON co.id=fo.order_id
      WHERE fo.vendor_id=vo.vendor_id
        AND fo.location_id=vo.location_id
        AND fo.mode='pickup'
        AND fo.status=ANY(ARRAY['awaiting_acceptance','accepted','picking','packed','ready_for_handover','shipped']::fulfilment_status[])
        AND co.status <> 'pending_payment'
    ) load ON true
    WHERE cv.public_id=$1
      AND (m.code='sparta' OR m.id::text='sparta')
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND vo.status='approved'
      AND v.status='active'
      AND l.active=true
      AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) >= 1
      AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3
      AND (cap.max_open_fulfilments IS NULL OR COALESCE(load.open_count,0)<cap.max_open_fulfilments)
    ORDER BY ib.stock_confirmed_at DESC,
             md5(cv.public_id || '|' || $2 || '|' || (extract(epoch from $3::timestamptz)::bigint / 86400)::text || '|' || v.public_id),
             v.public_id,
             vo.public_id
    LIMIT 1
  `, [canonicalVariantId, postcode, new Date(now)]);
  const row = result.rows[0];
  if (!row) return { available: false, availableToSell: 0 };
  const price = safeMinor(row.customer_price_minor);
  const availableToSell = safeMinor(row.available_to_sell) ?? 0;
  if (price === undefined || availableToSell <= 0) return { available: false, availableToSell: 0 };
  return {
    available: true,
    availableToSell,
    customerPriceMinor: price,
    vendorId: optionalText(row.vendor_public_id),
    vendorName: optionalText(row.vendor_name),
    adviser: optionalText(row.adviser_name)
  };
}

function crawlerCard(product: PublicProductSeoRecord, details: CatalogMetadata | undefined, preview: PublicOfferPreview): CatalogCard {
  const priceMinor = preview.customerPriceMinor ?? product.priceMinor;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    priceMinor,
    price: formatMoney(money(priceMinor)),
    categoryCode: product.categoryCode,
    departmentCode: product.departmentCode,
    categoryLabel: product.categoryLabel,
    gtin: product.gtin,
    mpn: product.mpn,
    description: product.description,
    brand: product.brand,
    color: product.color,
    sizes: product.sizes,
    fit: details?.fit,
    composition: details?.composition,
    madeIn: details?.madeIn,
    vendorId: preview.vendorId,
    vendorName: preview.vendorName,
    adviser: preview.adviser,
    mediaId: product.mediaId,
    mediaAlt: product.mediaAlt,
    sourceImageAvailable: product.sourceImageAvailable,
    available: preview.available,
    availableToSell: preview.availableToSell
  };
}

/**
 * SEO/social crawlers receive the same admitted public canonical catalogue through a
 * read-only offer preview. The selected offer is real and currently eligible, but no
 * Fair Vendor Assignment state is consumed by bot traffic.
 *
 * Limited catalogue surfaces deliberately inspect a bounded candidate window and resolve
 * previews in small parallel batches. This prevents crawler traffic from serially issuing
 * an unbounded number of expensive offer/capacity queries as the catalogue grows while
 * preserving the read-only, fail-closed commerce boundary.
 */
export async function getCrawlerCatalogCards(
  postcode = "23100",
  query = "",
  category = "",
  filters: CrawlerCatalogFilters = {},
  limit?: number
): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured() || (limit !== undefined && limit <= 0)) return [];

  const inventory = await getPublicProductSeoInventory();
  const normalizedQuery = normalizeSearchText(query);
  const candidates = inventory.products.filter((product) =>
    categoryCodeMatches(product.categoryCode, category, product.departmentCode)
    && matchesQuery(product, normalizedQuery)
    && (!filters.subcategory || product.categoryCode === filters.subcategory)
    && sameFilterValue(product.brand, filters.brand)
    && sameFilterValue(product.color, filters.color)
    && (!filters.size || product.sizes.some((size) => sameFilterValue(size, filters.size)))
  );
  const scanLimit = limit === undefined
    ? candidates.length
    : Math.min(candidates.length, Math.max(CRAWLER_MIN_LIMIT_SCAN, limit * CRAWLER_LIMIT_SCAN_MULTIPLIER));
  const scanCandidates = candidates.slice(0, scanLimit);
  const metadata = await loadCatalogMetadata(scanCandidates.map((product) => product.id));
  const eligibleCandidates = filters.fit
    ? scanCandidates.filter((product) => sameFilterValue(metadata.get(product.id)?.fit, filters.fit))
    : scanCandidates;
  const cards: CatalogCard[] = [];

  if (limit === undefined) {
    for (const product of eligibleCandidates) {
      const preview = await readOnlyOfferPreview(product.id, postcode);
      cards.push(crawlerCard(product, metadata.get(product.id), preview));
    }
    return cards;
  }

  for (let offset = 0; offset < eligibleCandidates.length && cards.length < limit; offset += CRAWLER_PREVIEW_BATCH_SIZE) {
    const batch = eligibleCandidates.slice(offset, offset + CRAWLER_PREVIEW_BATCH_SIZE);
    const previews = await Promise.all(batch.map((product) => readOnlyOfferPreview(product.id, postcode)));
    for (let index = 0; index < batch.length && cards.length < limit; index += 1) {
      const preview = previews[index];
      if (!preview?.available) continue;
      const product = batch[index];
      if (!product) continue;
      cards.push(crawlerCard(product, metadata.get(product.id), preview));
    }
  }

  return cards;
}

export async function getCrawlerCatalogCard(routeKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const product = await getPublicProductSeoSummary(routeKey);
  if (!product) return undefined;
  const [metadata, preview] = await Promise.all([
    loadCatalogMetadata([product.id]),
    readOnlyOfferPreview(product.id, postcode)
  ]);
  return crawlerCard(product, metadata.get(product.id), preview);
}

async function loadCrawlerHomepageCandidates(limit: number): Promise<readonly CrawlerHomepageCandidate[]> {
  const sourceLimit = Math.min(CRAWLER_HOMEPAGE_MAX_SOURCE_SCAN, Math.max(CRAWLER_HOMEPAGE_MIN_SOURCE_SCAN, limit * 16));
  const runtime = getProductionPostgresRuntime();
  const [localResult, dropshipResult] = await Promise.all([
    runtime.nativePool.query<CrawlerHomepageCandidateRow>(`
      WITH candidate_inventory AS MATERIALIZED (
        SELECT ib.offer_id,ib.stock_confirmed_at,
               GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)::integer AS available_to_sell
        FROM inventory_balances ib
        WHERE GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
        ORDER BY ib.stock_confirmed_at DESC
        LIMIT $1
      )
      SELECT DISTINCT ON (cv.id)
        cv.public_id AS canonical_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        c.code AS category_code,
        vo.customer_price_minor,
        candidate_inventory.available_to_sell,
        v.public_id AS vendor_public_id,
        v.trading_name AS vendor_name,
        candidate_inventory.stock_confirmed_at AS freshness
      FROM candidate_inventory
      JOIN vendor_offers vo ON vo.id=candidate_inventory.offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND vo.status='approved' AND vo.merchant_visible=true AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active' AND l.active=true
        AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      ORDER BY cv.id,candidate_inventory.stock_confirmed_at DESC,vo.customer_price_minor,vo.public_id
      LIMIT $2
    `, [sourceLimit, sourceLimit]),
    runtime.nativePool.query<CrawlerHomepageCandidateRow>(`
      WITH candidate_dso AS MATERIALIZED (
        SELECT dso.vendor_offer_id,dso.cached_quantity,dso.availability_checked_at
        FROM dropship_supplier_offers dso
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        WHERE dso.active=true
          AND ds.active=true
          AND ds.api_authoritative_availability=true
          AND dso.cached_available=true
          AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
          AND dso.availability_expires_at>now()
        ORDER BY dso.availability_checked_at DESC NULLS LAST
        LIMIT $1
      )
      SELECT DISTINCT ON (cv.id)
        cv.public_id AS canonical_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        c.code AS category_code,
        vo.customer_price_minor,
        GREATEST(COALESCE(candidate_dso.cached_quantity,1),1)::integer AS available_to_sell,
        v.public_id AS vendor_public_id,
        v.trading_name AS vendor_name,
        COALESCE(candidate_dso.availability_checked_at,vo.updated_at) AS freshness
      FROM candidate_dso
      JOIN vendor_offers vo ON vo.id=candidate_dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND vo.status='approved' AND vo.merchant_visible=true AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active' AND l.active=true
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      ORDER BY cv.id,COALESCE(candidate_dso.availability_checked_at,vo.updated_at) DESC,vo.customer_price_minor,vo.public_id
      LIMIT $2
    `, [sourceLimit, sourceLimit])
  ]);

  const byCanonical = new Map<string, CrawlerHomepageCandidate>();
  for (const row of [...localResult.rows, ...dropshipResult.rows]) {
    const priceMinor = safeMinor(row.customer_price_minor);
    const availableToSell = safeMinor(row.available_to_sell) ?? 0;
    const vendorId = optionalText(row.vendor_public_id);
    const vendorName = optionalText(row.vendor_name);
    if (priceMinor === undefined || priceMinor <= 0 || availableToSell <= 0 || !vendorId || !vendorName) continue;
    const candidate: CrawlerHomepageCandidate = {
      id: row.canonical_public_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      priceMinor,
      availableToSell,
      vendorId,
      vendorName,
      freshness: epoch(row.freshness)
    };
    const existing = byCanonical.get(candidate.id);
    if (!existing || candidate.freshness > existing.freshness || (candidate.freshness === existing.freshness && candidate.priceMinor < existing.priceMinor)) {
      byCanonical.set(candidate.id, candidate);
    }
  }

  return [...byCanonical.values()]
    .sort((left, right) => right.freshness - left.freshness || left.id.localeCompare(right.id))
    .slice(0, sourceLimit);
}

/**
 * Homepage crawler traffic is intentionally isolated from the full SEO inventory.
 * The homepage needs only a handful of cards, so it first selects a bounded set of
 * currently sellable local/dropship offers and enriches only those canonicals. This
 * prevents crawlers from projecting tens of thousands of product details, offer
 * availability records and media entries merely to render eight homepage cards.
 */
export async function getCrawlerHomepageCatalogCards(postcode = "23100", limit = 4): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured() || limit <= 0) return [];
  const candidates = await loadCrawlerHomepageCandidates(limit);
  if (!candidates.length) return [];
  const selected = candidates.slice(0, Math.max(limit, Math.min(candidates.length, limit * 2)));
  const ids = selected.map((candidate) => candidate.id);
  const [metadata, departmentCodes] = await Promise.all([
    loadCatalogMetadata(ids),
    loadCatalogDepartmentCodes(ids)
  ]);
  let imageByCanonical = new Map<string, Awaited<ReturnType<typeof approvedCatalogImages>>[number]>();
  try {
    const images = await approvedCatalogImages(selected.map((candidate) => ({
      canonicalVariantId: candidate.id,
      preferredVendorId: candidate.vendorId
    })));
    imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "crawler.homepage_media_projection_failed",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  return selected.slice(0, limit).map((candidate) => {
    const details = metadata.get(candidate.id);
    const image = imageByCanonical.get(candidate.id);
    return {
      id: candidate.id,
      slug: candidate.slug,
      title: details?.title ?? candidate.title,
      priceMinor: candidate.priceMinor,
      price: formatMoney(money(candidate.priceMinor)),
      categoryCode: candidate.categoryCode,
      departmentCode: departmentCodes.get(candidate.id),
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
      vendorId: candidate.vendorId,
      vendorName: candidate.vendorName,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      available: true,
      availableToSell: candidate.availableToSell
    } satisfies CatalogCard;
  });
}

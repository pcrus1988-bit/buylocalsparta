import { formatMoney, money, normalizeSearchText } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters, PublicProductSeoRecord } from "./catalog-view";
import { getPublicProductSeoInventory } from "./catalog-view";
import { loadCatalogMetadata, type CatalogMetadata } from "./catalog-metadata";
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

/**
 * Select one currently eligible pickup offer without mutating fairness state.
 * This is deliberately a public preview, not a customer assignment: it does not touch
 * fairness_rotation_state, sticky_assignments, qualified_exposures or assignment events.
 * The returned price/vendor are nevertheless real, currently eligible public commerce data,
 * keeping crawler-visible content materially aligned with what a customer can receive.
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
      SELECT COALESCE(NULLIF(ap.display_name,''),NULLIF(ap.job_title,''),'Local adviser') AS name
      FROM adviser_profiles ap
      WHERE ap.vendor_id=v.id AND ap.active=true
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
    available: preview.available,
    availableToSell: preview.availableToSell
  };
}

/**
 * SEO/social crawlers receive the same admitted public canonical catalogue through a
 * read-only offer preview. The selected offer is real and currently eligible, but no
 * Fair Vendor Assignment state is consumed by bot traffic.
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
    categoryCodeMatches(product.categoryCode, category)
    && matchesQuery(product, normalizedQuery)
    && (!filters.subcategory || product.categoryCode === filters.subcategory)
    && sameFilterValue(product.brand, filters.brand)
    && sameFilterValue(product.color, filters.color)
    && (!filters.size || product.sizes.some((size) => sameFilterValue(size, filters.size)))
  );
  const metadata = await loadCatalogMetadata(candidates.map((product) => product.id));
  const cards: CatalogCard[] = [];

  for (const product of candidates) {
    const details = metadata.get(product.id);
    if (filters.fit && !sameFilterValue(details?.fit, filters.fit)) continue;
    const preview = await readOnlyOfferPreview(product.id, postcode);
    if (limit !== undefined && !preview.available) continue;
    cards.push(crawlerCard(product, details, preview));
    if (limit !== undefined && cards.length >= limit) break;
  }

  return cards;
}

export async function getCrawlerCatalogCard(routeKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const inventory = await getPublicProductSeoInventory();
  const product = inventory.products.find((entry) => entry.id === routeKey || entry.slug === routeKey);
  if (!product) return undefined;
  const [metadata, preview] = await Promise.all([
    loadCatalogMetadata([product.id]),
    readOnlyOfferPreview(product.id, postcode)
  ]);
  return crawlerCard(product, metadata.get(product.id), preview);
}

export async function getCrawlerHomepageCatalogCards(postcode = "23100", limit = 4): Promise<readonly CatalogCard[]> {
  return getCrawlerCatalogCards(postcode, "", "", {}, limit);
}

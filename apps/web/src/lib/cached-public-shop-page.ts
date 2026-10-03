import "server-only";

import { unstable_cache } from "next/cache";
import type { CatalogCard } from "./catalog-view";
import {
  getCrawlerCatalogCards,
  type CrawlerCatalogFilters
} from "./crawler-catalog";
import {
  getPublishedDropshipCatalogPage,
  type PublishedDropshipCatalogPage,
  type PublishedDropshipCatalogPageInput
} from "./published-dropship-catalog-page";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const LOCAL_PRESENCE_CACHE_SECONDS = 30;
const PUBLIC_DISCOVERY_CACHE_SECONDS = 900;

const cachedLocalShopPresence = unstable_cache(
  async (): Promise<boolean> => {
    if (!productionDatabaseConfigured()) return false;
    const result = await getProductionPostgresRuntime().nativePool.query<{ available: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM public.inventory_balances ib
        JOIN public.vendor_offers vo ON vo.id=ib.offer_id
        JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN public.categories c ON c.id=cv.category_id
        JOIN public.markets m ON m.id=c.market_id
        JOIN public.vendor_businesses v ON v.id=vo.vendor_id
        JOIN public.vendor_locations l ON l.id=vo.location_id
        LEFT JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        WHERE m.code='sparta'
          AND dso.id IS NULL
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND v.status='active'
          AND l.active=true
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
          AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
          AND ib.stock_confirmed_at IS NOT NULL
          AND ib.stock_confirmed_at+make_interval(secs=>ib.freshness_ttl_seconds)>now()
        LIMIT 1
      ) AS available
    `);
    return result.rows[0]?.available === true;
  },
  ["public-shop-local-presence-v2"],
  { revalidate: LOCAL_PRESENCE_CACHE_SECONDS }
);

const cachedPublishedDropshipPage = unstable_cache(
  async (input: PublishedDropshipCatalogPageInput): Promise<PublishedDropshipCatalogPage> =>
    getPublishedDropshipCatalogPage(input),
  ["public-shop-dropship-page-v2"],
  { revalidate: PUBLIC_DISCOVERY_CACHE_SECONDS }
);

const cachedCrawlerCatalogPage = unstable_cache(
  async (
    postcode: string,
    query: string,
    category: string,
    filtersJson: string,
    limit: number
  ): Promise<readonly CatalogCard[]> =>
    getCrawlerCatalogCards(
      postcode,
      query,
      category,
      JSON.parse(filtersJson) as CrawlerCatalogFilters,
      limit
    ),
  ["public-shop-crawler-cards-v1"],
  { revalidate: PUBLIC_DISCOVERY_CACHE_SECONDS }
);

function stableFiltersJson(filters: CrawlerCatalogFilters): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .sort(([left], [right]) => left.localeCompare(right))
  ));
}

export async function hasLiveLocalShopProducts(): Promise<boolean> {
  return cachedLocalShopPresence();
}

export async function getCachedPublishedDropshipShopPage(
  input: PublishedDropshipCatalogPageInput
): Promise<PublishedDropshipCatalogPage> {
  return cachedPublishedDropshipPage(input);
}

export async function getCachedCrawlerCatalogCards(
  postcode = "23100",
  query = "",
  category = "",
  filters: CrawlerCatalogFilters = {},
  limit = 30
): Promise<readonly CatalogCard[]> {
  return cachedCrawlerCatalogPage(
    postcode,
    query,
    category,
    stableFiltersJson(filters),
    limit
  );
}

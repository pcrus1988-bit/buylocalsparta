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

const cachedLocalShopPresence = unstable_cache(
  async (): Promise<boolean> => {
    if (!productionDatabaseConfigured()) return false;
    const result = await getProductionPostgresRuntime().nativePool.query<{ available: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM public.storefront_catalog_read_model
        WHERE local_sellable=true
          AND local_available_until>now()
        LIMIT 1
      ) AS available
    `);
    return result.rows[0]?.available === true;
  },
  ["public-shop-local-presence-v1"],
  { revalidate: 120 }
);

const cachedPublishedDropshipPage = unstable_cache(
  async (input: PublishedDropshipCatalogPageInput): Promise<PublishedDropshipCatalogPage> =>
    getPublishedDropshipCatalogPage(input),
  ["public-shop-dropship-page-v1"],
  { revalidate: 300 }
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
  { revalidate: 300 }
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

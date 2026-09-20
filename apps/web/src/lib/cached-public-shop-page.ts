import "server-only";

import { unstable_cache } from "next/cache";
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
  { revalidate: 15 }
);

const cachedPublishedDropshipPage = unstable_cache(
  async (input: PublishedDropshipCatalogPageInput): Promise<PublishedDropshipCatalogPage> =>
    getPublishedDropshipCatalogPage(input),
  ["public-shop-dropship-page-v1"],
  { revalidate: 30 }
);

export async function hasLiveLocalShopProducts(): Promise<boolean> {
  return cachedLocalShopPresence();
}

export async function getCachedPublishedDropshipShopPage(
  input: PublishedDropshipCatalogPageInput
): Promise<PublishedDropshipCatalogPage> {
  return cachedPublishedDropshipPage(input);
}

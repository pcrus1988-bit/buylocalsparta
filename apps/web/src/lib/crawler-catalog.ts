import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { getCrawlerLocalCatalogCard } from "./crawler-local-catalog-card";
import { getCrawlerLocalCatalogPage } from "./crawler-local-catalog-page";
import { getPublishedDropshipCatalogPage } from "./published-dropship-catalog-page";
import { productionDatabaseConfigured } from "./postgres-runtime";

export type CrawlerCatalogFilters = CatalogFilters & Readonly<{ fit?: string }>;

const MAX_CRAWLER_PAGE_SIZE = 36;
const DEFAULT_CRAWLER_PAGE_SIZE = 30;

function boundedLimit(limit: number | undefined): number {
  const requested = limit ?? DEFAULT_CRAWLER_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_CRAWLER_PAGE_SIZE, requested));
}

/**
 * Read-only crawler catalogue.
 *
 * Local and supplier inventory are each admitted before LIMIT by their dedicated
 * bounded SQL projections. No crawler request is allowed to hydrate the complete
 * public SEO catalogue, and no fairness/sticky assignment state is mutated.
 */
export async function getCrawlerCatalogCards(
  postcode = "23100",
  query = "",
  category = "",
  filters: CrawlerCatalogFilters = {},
  limit?: number
): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured() || (limit !== undefined && limit <= 0)) return [];

  const pageSize = boundedLimit(limit);
  const localProducts = [...await getCrawlerLocalCatalogPage(postcode, query, category, filters, pageSize)];
  if (localProducts.length >= pageSize) return localProducts.slice(0, pageSize);

  const remaining = pageSize - localProducts.length;
  const dropshipPage = await getPublishedDropshipCatalogPage({
    query,
    category,
    filters,
    attributeFilters: {},
    limit: remaining,
    offset: 0
  });
  const seen = new Set(localProducts.map((product) => product.id));
  localProducts.push(...dropshipPage.products.filter((product) => !seen.has(product.id)).slice(0, remaining));
  return localProducts.slice(0, pageSize);
}

/** Exact crawler product projection without a catalogue-wide duplicate/title scan. */
export async function getCrawlerCatalogCard(routeKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const local = await getCrawlerLocalCatalogCard(routeKey);
  if (local) return local;

  const dropship = await getPublishedDropshipCatalogPage({
    slugOrId: routeKey.trim(),
    limit: 1
  });
  return dropship.products[0];
}

/** Homepage crawler cards use the same bounded, sellable-only read model. */
export async function getCrawlerHomepageCatalogCards(postcode = "23100", limit = 4): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured() || limit <= 0) return [];
  return getCrawlerCatalogCards(postcode, "", "", {}, limit);
}

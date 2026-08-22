import { formatMoney, money, normalizeSearchText } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters, PublicProductSeoRecord } from "./catalog-view";
import { getPublicProductSeoInventory } from "./catalog-view";
import { loadCatalogMetadata, type CatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { categoryCodeMatches } from "./storefront-taxonomy";

export type CrawlerCatalogFilters = CatalogFilters & Readonly<{ fit?: string }>;

type ReadOnlyAvailability = Readonly<{ available: boolean; availableToSell: number }>;

function sameFilterValue(left: string | undefined, right: string | undefined): boolean {
  if (!right) return true;
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

function matchesQuery(product: PublicProductSeoRecord, query: string): boolean {
  if (!query) return true;
  return [product.title, product.description, product.brand, product.color, product.gtin, product.mpn, product.categoryLabel]
    .some((value) => normalizeSearchText(value ?? "").includes(query));
}

function crawlerCard(product: PublicProductSeoRecord, details: CatalogMetadata | undefined, availability: ReadOnlyAvailability): CatalogCard {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    priceMinor: product.priceMinor,
    price: formatMoney(money(product.priceMinor)),
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
    mediaId: product.mediaId,
    mediaAlt: product.mediaAlt,
    available: availability.available,
    availableToSell: availability.availableToSell
  };
}

/**
 * SEO/social crawlers receive the same admitted public canonical catalogue but through
 * a strictly read-only projection. Availability is checked without Fair Vendor Assignment,
 * so bot traffic cannot create sticky assignments, qualified exposures or fairness events.
 * The canonical platform price remains informational; transactional visitors still resolve
 * their actual assigned vendor offer through the normal customer path.
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
  const commerce = getProductionPostgresRuntime().customerCommerce;
  const cards: CatalogCard[] = [];

  for (const product of candidates) {
    const details = metadata.get(product.id);
    if (filters.fit && !sameFilterValue(details?.fit, filters.fit)) continue;
    const availability = await commerce.publicCanonicalAvailability(product.id, { postcode });
    if (!availability) continue;
    if (limit !== undefined && !availability.available) continue;
    cards.push(crawlerCard(product, details, availability));
    if (limit !== undefined && cards.length >= limit) break;
  }

  return cards;
}

export async function getCrawlerCatalogCard(routeKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const inventory = await getPublicProductSeoInventory();
  const product = inventory.products.find((entry) => entry.id === routeKey || entry.slug === routeKey);
  if (!product) return undefined;
  const [metadata, availability] = await Promise.all([
    loadCatalogMetadata([product.id]),
    getProductionPostgresRuntime().customerCommerce.publicCanonicalAvailability(product.id, { postcode })
  ]);
  return availability ? crawlerCard(product, metadata.get(product.id), availability) : undefined;
}

export async function getCrawlerHomepageCatalogCards(postcode = "23100", limit = 4): Promise<readonly CatalogCard[]> {
  return getCrawlerCatalogCards(postcode, "", "", {}, limit);
}

import { unstable_cache } from "next/cache";
import type { CatalogFilters } from "./catalog-view";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import { getAvailableCatalogTaxonomy } from "./available-catalog-taxonomy";

const readCachedShopTaxonomy = unstable_cache(
  async (
    category: string,
    query: string,
    filtersJson: string,
    postcode: string,
    leafKey: string,
    attributeFiltersJson: string
  ) => getAvailableCatalogTaxonomy(
    category,
    query,
    JSON.parse(filtersJson) as CatalogFilters,
    postcode,
    leafKey || undefined,
    JSON.parse(attributeFiltersJson) as CatalogAttributeFilters
  ),
  ["shop-catalog-taxonomy-v1"],
  { revalidate: 180 }
);

function stableJson(value: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => Boolean(entry))
      .sort(([left], [right]) => left.localeCompare(right))
  ));
}

/**
 * Taxonomy/facets are catalogue vocabulary, not visitor state. Cache the complete
 * projection briefly so every customer does not rebuild it from the full catalogue.
 * Personalized assignment and live availability stay outside this cache.
 */
export function getCachedShopTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  postcode = "23100",
  leafKey?: string,
  attributeFilters: CatalogAttributeFilters = {}
) {
  return readCachedShopTaxonomy(
    category,
    query,
    stableJson(filters),
    postcode,
    leafKey ?? "",
    stableJson(attributeFilters)
  );
}

import { unstable_cache } from "next/cache";
import type { CatalogFilters } from "./catalog-view";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import { getAvailableCatalogTaxonomy } from "./available-catalog-taxonomy";
import { getFastShopTaxonomy } from "./fast-shop-taxonomy";

const readCachedFastShopTaxonomy = unstable_cache(
  async (
    category: string,
    query: string,
    filtersJson: string,
    postcode: string,
    attributeFiltersJson: string
  ) => getFastShopTaxonomy(
    category,
    query,
    JSON.parse(filtersJson) as CatalogFilters,
    postcode,
    JSON.parse(attributeFiltersJson) as CatalogAttributeFilters
  ),
  ["shop-catalog-taxonomy-fast-v2"],
  { revalidate: 300 }
);

const readCachedRichShopTaxonomy = unstable_cache(
  async (
    category: string,
    query: string,
    filtersJson: string,
    postcode: string,
    leafKey: string,
    attributeFiltersJson: string
  ) => {
    const filters = JSON.parse(filtersJson) as CatalogFilters;
    const attributeFilters = JSON.parse(attributeFiltersJson) as CatalogAttributeFilters;
    try {
      return await getAvailableCatalogTaxonomy(
        category,
        query,
        filters,
        postcode,
        leafKey || undefined,
        attributeFilters
      );
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.rich_taxonomy_degraded",
        message: error instanceof Error ? error.message : String(error)
      }));
      return getFastShopTaxonomy(category, query, filters, postcode, attributeFilters);
    }
  },
  ["shop-catalog-taxonomy-rich-v2"],
  { revalidate: 300 }
);

function stableJson(value: Readonly<Record<string, string | undefined>>): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => Boolean(entry))
      .sort(([left], [right]) => left.localeCompare(right))
  ));
}

/**
 * Standard /shop filters use the SQL-only taxonomy projection so catalogue growth
 * never forces the request to hydrate every canonical and every metadata record.
 * Governed leaf-specific attribute facets keep the richer path; if that projection
 * degrades, the page falls back to the standard vocabulary instead of failing.
 */
export function getCachedShopTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  postcode = "23100",
  leafKey?: string,
  attributeFilters: CatalogAttributeFilters = {}
) {
  const filtersJson = stableJson(filters);
  const attributeFiltersJson = stableJson(attributeFilters);
  const requiresRichAttributes = Boolean(leafKey || Object.keys(attributeFilters).length);

  return requiresRichAttributes
    ? readCachedRichShopTaxonomy(
        category,
        query,
        filtersJson,
        postcode,
        leafKey ?? "",
        attributeFiltersJson
      )
    : readCachedFastShopTaxonomy(
        category,
        query,
        filtersJson,
        postcode,
        attributeFiltersJson
      );
}

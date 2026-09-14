import { unstable_cache } from "next/cache";
import type { CatalogFilters } from "./catalog-view";
import type { CatalogAttributeFilters } from "./catalog-attribute-filter";
import { getFastRichShopTaxonomy } from "./fast-rich-shop-taxonomy";
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
  ) => getFastRichShopTaxonomy(
    category,
    query,
    JSON.parse(filtersJson) as CatalogFilters,
    postcode,
    leafKey,
    JSON.parse(attributeFiltersJson) as CatalogAttributeFilters
  ),
  ["shop-catalog-taxonomy-rich-v3"],
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
 * Both standard and governed leaf-specific /shop filters stay inside SQL. The
 * previous rich path hydrated every public canonical plus metadata in Node, which
 * made catalogue growth directly increase request time and connection pressure.
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

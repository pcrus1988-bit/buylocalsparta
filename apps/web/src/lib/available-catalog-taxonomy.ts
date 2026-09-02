import { normalizeSearchText, searchTextRelevance } from "@buy-local-sparta/core";
import type { CatalogFacetOption, CatalogFacets, CatalogFilters } from "./catalog-view";
import { loadCatalogMetadata, type CatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { categoryCodeMatches, STOREFRONT_CATEGORIES, type StorefrontCategory } from "./storefront-taxonomy";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import {
  catalogAttributeDefinitionsForLeaf,
  catalogAttributeValue,
  type CatalogAttributeFacet
} from "./catalog-attribute-facets";
import { matchesCatalogAttributeFilters, type CatalogAttributeFilters } from "./catalog-attribute-filter";

type AvailableCanonical = Readonly<{
  id: string;
  title: string;
  categoryCode: string;
  departmentCode?: string;
}>;

export type AvailableCatalogTaxonomy = Readonly<{
  categories: readonly StorefrontCategory[];
  facets: CatalogFacets;
  attributeFacets: readonly CatalogAttributeFacet[];
}>;

type FacetBundle = Readonly<{
  facets: CatalogFacets;
  attributeFacets: readonly CatalogAttributeFacet[];
}>;

const AVAILABILITY_CONCURRENCY = 6;
const EMPTY_FACETS: CatalogFacets = { subcategories: [], brands: [], colors: [], sizes: [] };
const EMPTY_BUNDLE: FacetBundle = { facets: EMPTY_FACETS, attributeFacets: [] };

function sameFilterValue(left: string | undefined, right: string | undefined): boolean {
  if (!right) return true;
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

function matchesQuery(product: AvailableCanonical, metadata: CatalogMetadata | undefined, query: string): boolean {
  if (!normalizeSearchText(query)) return true;
  return searchTextRelevance(query, [
    product.title,
    metadata?.description,
    metadata?.brand,
    metadata?.color,
    metadata?.mpn,
    metadata?.gtin,
    metadata?.categoryLabel,
    ...(metadata?.sizes ?? []),
    metadata?.fit,
    metadata?.composition,
    metadata?.madeIn
  ]) > 0;
}

function matchesFiltersExcept(
  product: AvailableCanonical,
  metadata: CatalogMetadata | undefined,
  filters: CatalogFilters,
  omitted: keyof CatalogFilters
): boolean {
  if (omitted !== "subcategory" && filters.subcategory && product.categoryCode !== filters.subcategory) return false;
  if (omitted !== "brand" && !sameFilterValue(metadata?.brand, filters.brand)) return false;
  if (omitted !== "color" && !sameFilterValue(metadata?.color, filters.color)) return false;
  if (omitted !== "size" && filters.size && !(metadata?.sizes ?? []).some((size) => sameFilterValue(size, filters.size))) return false;
  return true;
}

function matchesAllFixedFilters(
  product: AvailableCanonical,
  metadata: CatalogMetadata | undefined,
  filters: CatalogFilters
): boolean {
  if (filters.subcategory && product.categoryCode !== filters.subcategory) return false;
  if (!sameFilterValue(metadata?.brand, filters.brand)) return false;
  if (!sameFilterValue(metadata?.color, filters.color)) return false;
  if (filters.size && !(metadata?.sizes ?? []).some((size) => sameFilterValue(size, filters.size))) return false;
  return true;
}

function facetOptions(values: Iterable<string>): readonly CatalogFacetOption[] {
  return [...new Set(values)]
    .sort((a, b) => a.localeCompare(b, "el"))
    .map((value) => ({ value, label: value }));
}

function availableCategories(products: readonly AvailableCanonical[]): readonly StorefrontCategory[] {
  return STOREFRONT_CATEGORIES.filter((category) =>
    products.some((product) => categoryCodeMatches(product.categoryCode, category.slug, product.departmentCode))
  );
}

async function buildFacetBundle(
  products: readonly AvailableCanonical[],
  category: string,
  query: string,
  filters: CatalogFilters,
  leafKey?: string,
  attributeFilters: CatalogAttributeFilters = {}
): Promise<FacetBundle> {
  const scoped = products.filter((product) => categoryCodeMatches(product.categoryCode, category, product.departmentCode));
  if (scoped.length === 0) return EMPTY_BUNDLE;

  const metadata = await loadCatalogMetadata(scoped.map((product) => product.id));
  const visible = scoped.filter((product) => matchesQuery(product, metadata.get(product.id), query));

  const subcategoryMap = new Map<string, string>();
  const brands: string[] = [];
  const colors: string[] = [];
  const sizes: string[] = [];

  for (const product of visible) {
    const details = metadata.get(product.id);
    if (!matchesCatalogAttributeFilters(details?.attributes, attributeFilters)) continue;
    if (matchesFiltersExcept(product, details, filters, "subcategory")) {
      subcategoryMap.set(product.categoryCode, details?.categoryLabel ?? product.categoryCode);
    }
    if (details?.brand && matchesFiltersExcept(product, details, filters, "brand")) brands.push(details.brand);
    if (details?.color && matchesFiltersExcept(product, details, filters, "color")) colors.push(details.color);
    if (matchesFiltersExcept(product, details, filters, "size")) sizes.push(...(details?.sizes ?? []));
  }

  const attributeFacets: CatalogAttributeFacet[] = [];
  for (const definition of catalogAttributeDefinitionsForLeaf(leafKey)) {
    const values: string[] = [];
    for (const product of visible) {
      const details = metadata.get(product.id);
      if (!matchesAllFixedFilters(product, details, filters)) continue;
      if (!matchesCatalogAttributeFilters(details?.attributes, attributeFilters, definition.key)) continue;
      const value = catalogAttributeValue(details?.attributes, definition);
      if (value) values.push(value);
    }
    const options = facetOptions(values);
    if (options.length > 0 && options.length <= 40) attributeFacets.push({ key: definition.key, label: definition.label, options });
  }

  return {
    facets: {
      subcategories: [...subcategoryMap.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "el")),
      brands: facetOptions(brands),
      colors: facetOptions(colors),
      sizes: facetOptions(sizes)
    },
    attributeFacets
  };
}

/**
 * Public discovery inventory: active, non-suppressed canonical products remain
 * navigable even when no local shop has fresh sellable stock at this moment.
 * Availability is a commerce annotation, not the definition of the catalogue.
 */
export async function getDiscoverableCatalogCanonicals(): Promise<readonly AvailableCanonical[]> {
  if (!productionDatabaseConfigured()) return [];
  const canonicals = await getProductionPostgresRuntime().customerCommerce.publicCanonicals();
  if (canonicals.length === 0) return [];
  const departmentCodes = await loadCatalogDepartmentCodes(canonicals.map((product) => product.id));
  return canonicals.map((product) => ({ ...product, departmentCode: departmentCodes.get(product.id) }));
}

/**
 * Strict sellability projection retained for surfaces that specifically need to
 * answer "can this be bought locally right now?". Do not use it to define the
 * existence of taxonomy branches or attribute vocabulary.
 */
export async function getAvailableCatalogCanonicals(postcode = "23100"): Promise<readonly AvailableCanonical[]> {
  if (!productionDatabaseConfigured()) return [];
  const commerce = getProductionPostgresRuntime().customerCommerce;
  const canonicals = await commerce.publicCanonicals();
  if (canonicals.length === 0) return [];
  const departmentCodes = await loadCatalogDepartmentCodes(canonicals.map((product) => product.id));

  const available = new Array<boolean>(canonicals.length).fill(false);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(AVAILABILITY_CONCURRENCY, canonicals.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= canonicals.length) return;
      try {
        const result = await commerce.publicCanonicalAvailability(canonicals[index].id, { postcode });
        available[index] = Boolean(result?.available && result.availableToSell > 0);
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: "storefront.taxonomy_availability_degraded",
          canonicalVariantId: canonicals[index].id,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  });
  await Promise.all(workers);

  return canonicals
    .filter((_, index) => available[index])
    .map((product) => ({ ...product, departmentCode: departmentCodes.get(product.id) }));
}

export async function getAvailableStorefrontCategories(postcode = "23100"): Promise<readonly StorefrontCategory[]> {
  return availableCategories(await getAvailableCatalogCanonicals(postcode));
}

/**
 * Builds the shop's discovery taxonomy from all public canonicals. Fixed and
 * structured facets still respect the active query and every other selected filter,
 * but a temporarily unavailable product can contribute its governed category and
 * attribute values. Purchase actions remain protected by the independent live
 * availability/fair-assignment path.
 */
export async function getAvailableCatalogTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  _postcode = "23100",
  leafKey?: string,
  attributeFilters: CatalogAttributeFilters = {}
): Promise<AvailableCatalogTaxonomy> {
  const products = await getDiscoverableCatalogCanonicals();
  const bundle = await buildFacetBundle(products, category, query, filters, leafKey, attributeFilters);
  return {
    categories: availableCategories(products),
    facets: bundle.facets,
    attributeFacets: bundle.attributeFacets
  };
}

export async function getAvailableCatalogFacets(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  _postcode = "23100"
): Promise<CatalogFacets> {
  return (await buildFacetBundle(await getDiscoverableCatalogCanonicals(), category, query, filters)).facets;
}

import { normalizeSearchText } from "@buy-local-sparta/core";
import type { CatalogFacetOption, CatalogFacets, CatalogFilters } from "./catalog-view";
import { loadCatalogMetadata, type CatalogMetadata } from "./catalog-metadata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { categoryCodeMatches, STOREFRONT_CATEGORIES, type StorefrontCategory } from "./storefront-taxonomy";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";

type AvailableCanonical = Readonly<{
  id: string;
  title: string;
  categoryCode: string;
  departmentCode?: string;
}>;

export type AvailableCatalogTaxonomy = Readonly<{
  categories: readonly StorefrontCategory[];
  facets: CatalogFacets;
}>;

const AVAILABILITY_CONCURRENCY = 6;
const EMPTY_FACETS: CatalogFacets = { subcategories: [], brands: [], colors: [], sizes: [] };

function sameFilterValue(left: string | undefined, right: string | undefined): boolean {
  if (!right) return true;
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

function matchesQuery(product: AvailableCanonical, metadata: CatalogMetadata | undefined, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return [product.title, metadata?.description, metadata?.brand, metadata?.color, metadata?.mpn, metadata?.categoryLabel]
    .some((value) => normalizeSearchText(value ?? "").includes(normalizedQuery));
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

async function buildFacets(
  products: readonly AvailableCanonical[],
  category: string,
  query: string,
  filters: CatalogFilters
): Promise<CatalogFacets> {
  const scoped = products.filter((product) => categoryCodeMatches(product.categoryCode, category, product.departmentCode));
  if (scoped.length === 0) return EMPTY_FACETS;

  const metadata = await loadCatalogMetadata(scoped.map((product) => product.id));
  const normalizedQuery = normalizeSearchText(query);
  const visible = scoped.filter((product) => matchesQuery(product, metadata.get(product.id), normalizedQuery));

  const subcategoryMap = new Map<string, string>();
  const brands: string[] = [];
  const colors: string[] = [];
  const sizes: string[] = [];

  for (const product of visible) {
    const details = metadata.get(product.id);
    if (matchesFiltersExcept(product, details, filters, "subcategory")) {
      subcategoryMap.set(product.categoryCode, details?.categoryLabel ?? product.categoryCode);
    }
    if (details?.brand && matchesFiltersExcept(product, details, filters, "brand")) brands.push(details.brand);
    if (details?.color && matchesFiltersExcept(product, details, filters, "color")) colors.push(details.color);
    if (matchesFiltersExcept(product, details, filters, "size")) sizes.push(...(details?.sizes ?? []));
  }

  return {
    subcategories: [...subcategoryMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "el")),
    brands: facetOptions(brands),
    colors: facetOptions(colors),
    sizes: facetOptions(sizes)
  };
}

/**
 * Taxonomy is a customer-navigation surface, so it must be stricter than canonical
 * discovery. A branch is visible only when at least one public canonical currently
 * has an eligible local offer with fresh inventory for the storefront postcode.
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
 * Builds all taxonomy exposed by the shop in one availability pass. Facets respect
 * the other selected filters, so no subcategory/brand/color/size option can lead to
 * zero currently sellable products in the active result context.
 */
export async function getAvailableCatalogTaxonomy(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  postcode = "23100"
): Promise<AvailableCatalogTaxonomy> {
  const products = await getAvailableCatalogCanonicals(postcode);
  return {
    categories: availableCategories(products),
    facets: await buildFacets(products, category, query, filters)
  };
}

export async function getAvailableCatalogFacets(
  category = "",
  query = "",
  filters: CatalogFilters = {},
  postcode = "23100"
): Promise<CatalogFacets> {
  return buildFacets(await getAvailableCatalogCanonicals(postcode), category, query, filters);
}

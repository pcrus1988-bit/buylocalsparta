import { unstable_cache } from "next/cache";
import { decodeCatalogSizeGroup } from "./catalog-size";
import type { VendorDropshipFacetOption, VendorDropshipFacets } from "./vendor-dropship-catalog-page";
import { getContextualVendorDropshipFacets } from "./vendor-dropship-contextual-facets";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { storefrontCategoryBySlug } from "./storefront-taxonomy";

export type ShopSupplierFacetInput = Readonly<{
  query?: string;
  category?: string;
  subcategories?: readonly string[];
  brand?: string;
  color?: string;
  size?: string;
  fit?: string;
}>;

const EMPTY: VendorDropshipFacets = {
  total: 0,
  categories: [],
  brands: [],
  colors: [],
  sizes: [],
  fits: [],
  materials: []
};

async function readActiveSupplierVendorIds(): Promise<readonly string[]> {
  if (!productionDatabaseConfigured()) return [];
  const result = await getProductionPostgresRuntime().nativePool.query<{ public_id: string }>(`
    SELECT DISTINCT vendor.public_id
    FROM public.dropship_suppliers supplier
    JOIN public.vendor_businesses vendor ON vendor.id=supplier.owner_vendor_id
    WHERE supplier.active=true
      AND supplier.api_authoritative_availability=true
      AND vendor.status='active'
    ORDER BY vendor.public_id
  `);
  return result.rows.map((row) => row.public_id).filter(Boolean);
}

const cachedActiveSupplierVendorIds = unstable_cache(
  readActiveSupplierVendorIds,
  ["shop-active-supplier-vendors-v1"],
  { revalidate: 300 }
);

const cachedVendorFacets = unstable_cache(
  async (vendorId: string, contextJson: string): Promise<VendorDropshipFacets> => {
    const context = JSON.parse(contextJson) as Readonly<{
      query?: string;
      prefixes?: readonly string[];
      categories?: readonly string[];
      brand?: string;
      color?: string;
      sizes?: readonly string[];
      fit?: string;
    }>;
    return getContextualVendorDropshipFacets(vendorId, context);
  },
  ["shop-supplier-contextual-facets-v2"],
  { revalidate: 300 }
);

function mergeOptions(groups: readonly (readonly VendorDropshipFacetOption[])[]): readonly VendorDropshipFacetOption[] {
  const merged = new Map<string, VendorDropshipFacetOption>();
  for (const group of groups) {
    for (const entry of group) {
      const key = entry.value.trim().toLocaleLowerCase("en");
      if (!key) continue;
      const current = merged.get(key);
      merged.set(key, current
        ? {
            value: current.value || entry.value,
            label: current.label || entry.label || entry.value,
            count: current.count + entry.count
          }
        : {
            value: entry.value,
            label: entry.label || entry.value,
            count: entry.count
          });
    }
  }
  return [...merged.values()].sort((left, right) =>
    right.count - left.count || left.label.localeCompare(right.label, "el")
  );
}

function mergeFacets(groups: readonly VendorDropshipFacets[]): VendorDropshipFacets {
  if (!groups.length) return EMPTY;
  return {
    total: groups.reduce((sum, group) => sum + group.total, 0),
    categories: mergeOptions(groups.map((group) => group.categories)),
    brands: mergeOptions(groups.map((group) => group.brands)),
    colors: mergeOptions(groups.map((group) => group.colors)),
    sizes: mergeOptions(groups.map((group) => group.sizes)),
    fits: mergeOptions(groups.map((group) => group.fits)),
    materials: mergeOptions(groups.map((group) => group.materials))
  };
}

async function loadForVendors(
  vendorIds: readonly string[],
  context: Readonly<{
    query?: string;
    prefixes?: readonly string[];
    categories?: readonly string[];
    brand?: string;
    color?: string;
    sizes?: readonly string[];
    fit?: string;
  }>
): Promise<VendorDropshipFacets> {
  const groups: VendorDropshipFacets[] = [];
  const contextJson = JSON.stringify(context);
  // The web runtime is intentionally configured with a single PostgreSQL client.
  // Resolve cold cache misses sequentially instead of competing for that one slot.
  for (const vendorId of vendorIds) {
    groups.push(await cachedVendorFacets(vendorId, contextJson));
  }
  return mergeFacets(groups);
}

/**
 * Complements the hub-wide shop taxonomy with the already-maintained supplier
 * family facet projection. This is only used when the narrow public facet read
 * model is missing dimensions; it never scans raw supplier offers.
 */
export async function getCachedShopSupplierFacets(
  input: ShopSupplierFacetInput = {}
): Promise<VendorDropshipFacets> {
  const vendorIds = await cachedActiveSupplierVendorIds();
  if (!vendorIds.length) return EMPTY;

  const explicitSubcategories = [...new Set((input.subcategories ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 64);
  const requestedCategory = input.category?.trim().toLocaleLowerCase("en").replaceAll("_", "-") ?? "";
  const governedCategory = storefrontCategoryBySlug(requestedCategory);
  const prefixes = requestedCategory
    ? [...new Set((governedCategory?.aliases ?? [requestedCategory]).map((value) => value.trim().toLocaleLowerCase("en").replaceAll("_", "-")).filter(Boolean))].slice(0, 48)
    : [];

  // Keep top-level department scope separate from an exact leaf selection. The
  // live family projection carries both category_codes and department_codes, so
  // a Fashion request correctly includes sneakers/boots/etc even when the leaf
  // code itself does not start with "fashion-". Category facet choices remain
  // disjunctive, but cannot leak Beauty/Home leaves outside the selected department.
  return loadForVendors(vendorIds, {
    query: input.query?.trim() || undefined,
    prefixes,
    categories: explicitSubcategories,
    brand: input.brand?.trim() || undefined,
    color: input.color?.trim() || undefined,
    sizes: decodeCatalogSizeGroup(input.size ?? ""),
    fit: input.fit?.trim() || undefined
  });
}

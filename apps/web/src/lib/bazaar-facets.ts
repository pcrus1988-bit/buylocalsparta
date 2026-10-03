import { unstable_cache } from "next/cache";
import type { BazaarCondition, BazaarSource } from "./bazaar-catalog";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type BazaarFacets = Readonly<{
  brands: readonly string[];
  categories: readonly string[];
  conditions: readonly BazaarCondition[];
  sources: readonly BazaarSource[];
}>;

type FacetRow = Readonly<{
  brands: string[] | null;
  categories: string[] | null;
  conditions: string[] | null;
  sources: string[] | null;
}>;

const EMPTY_FACETS: BazaarFacets = { brands: [], categories: [], conditions: [], sources: [] };
const VALID_CONDITIONS = new Set<BazaarCondition>(["preloved", "preowned_defect", "open_box", "new", "refurbished", "used"]);
const VALID_SOURCES = new Set<BazaarSource>([
  "supplier_preloved",
  "supplier_preowned_defect",
  "supplier_tester",
  "supplier_sample",
  "customer_return",
  "open_box",
  "display_stock",
  "damaged_packaging",
  "admin_curated"
]);

async function loadBazaarFacets(): Promise<BazaarFacets> {
  if (!productionDatabaseConfigured()) return EMPTY_FACETS;

  // Read the same precomputed live BAZAAR projection as product discovery.
  // Checkout/order actions remain the authoritative live availability boundary.
  const result = await getProductionPostgresRuntime().nativePool.query<FacetRow>(`
    SELECT
      ARRAY_AGG(DISTINCT NULLIF(BTRIM(brm.brand_name),'') ORDER BY NULLIF(BTRIM(brm.brand_name),''))
        FILTER (WHERE NULLIF(BTRIM(brm.brand_name),'') IS NOT NULL) AS brands,
      ARRAY_AGG(DISTINCT brm.category_code ORDER BY brm.category_code) AS categories,
      ARRAY_AGG(DISTINCT brm.condition ORDER BY brm.condition) AS conditions,
      ARRAY_AGG(DISTINCT brm.bazaar_source ORDER BY brm.bazaar_source)
        FILTER (WHERE brm.bazaar_source IS NOT NULL) AS sources
    FROM public.storefront_bazaar_read_model brm
    WHERE (NOT brm.supplier_fulfilled OR brm.available_until>now())
  `);

  const row = result.rows[0];
  if (!row) return EMPTY_FACETS;
  return {
    brands: row.brands ?? [],
    categories: row.categories ?? [],
    conditions: (row.conditions ?? []).filter((value): value is BazaarCondition => VALID_CONDITIONS.has(value as BazaarCondition)),
    sources: (row.sources ?? []).filter((value): value is BazaarSource => VALID_SOURCES.has(value as BazaarSource))
  };
}

export const getCachedBazaarFacets = unstable_cache(
  loadBazaarFacets,
  ["bazaar-facets-v7-read-model"],
  { revalidate: 300 }
);

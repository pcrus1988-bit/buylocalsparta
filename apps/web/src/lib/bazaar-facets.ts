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

  // Facet discovery is catalogue metadata, not an inventory reservation. Keep it
  // independent from the expensive offer/stock joins; the result query and all
  // cart/order actions still enforce live sellability.
  const result = await getProductionPostgresRuntime().nativePool.query<FacetRow>(`
    SELECT
      ARRAY_AGG(DISTINCT NULLIF(BTRIM(b.name),'') ORDER BY NULLIF(BTRIM(b.name),''))
        FILTER (WHERE NULLIF(BTRIM(b.name),'') IS NOT NULL) AS brands,
      ARRAY_AGG(DISTINCT c.code ORDER BY c.code) AS categories,
      ARRAY_AGG(DISTINCT cv.condition ORDER BY cv.condition) AS conditions,
      ARRAY_AGG(DISTINCT cv.bazaar_source ORDER BY cv.bazaar_source)
        FILTER (WHERE cv.bazaar_source IS NOT NULL) AS sources
    FROM canonical_variants cv
    JOIN categories c ON c.id=cv.category_id
    LEFT JOIN brands b ON b.id=cv.brand_id
    WHERE cv.commerce_channel='bazaar'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
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
  ["bazaar-facets-v6-catalogue-metadata"],
  { revalidate: 900 }
);

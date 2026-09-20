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

  const result = await getProductionPostgresRuntime().nativePool.query<FacetRow>(`
    WITH eligible AS MATERIALIZED (
      SELECT DISTINCT
        cv.id,
        NULLIF(BTRIM(b.name),'') AS brand,
        c.code AS category,
        cv.condition,
        cv.bazaar_source
      FROM canonical_variants cv
      JOIN categories c ON c.id=cv.category_id
      JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN brands b ON b.id=cv.brand_id
      LEFT JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      LEFT JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE cv.commerce_channel='bazaar'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND (
          (
            dso.id IS NOT NULL
            AND dso.active=true
            AND ds.active=true
            AND ds.api_authoritative_availability=true
            AND dso.cached_available=true
            AND dso.cached_quantity>=1
            AND dso.availability_expires_at IS NOT NULL
            AND dso.availability_expires_at>now()
            AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          )
          OR (
            dso.id IS NULL
            AND GREATEST(0,COALESCE(ib.on_hand,0)-COALESCE(ib.active_reservations,0)-COALESCE(ib.safety_stock,0)-COALESCE(ib.blocked,0))>0
          )
        )
    )
    SELECT
      ARRAY_AGG(DISTINCT brand ORDER BY brand) FILTER (WHERE brand IS NOT NULL) AS brands,
      ARRAY_AGG(DISTINCT category ORDER BY category) AS categories,
      ARRAY_AGG(DISTINCT condition ORDER BY condition) AS conditions,
      ARRAY_AGG(DISTINCT bazaar_source ORDER BY bazaar_source) FILTER (WHERE bazaar_source IS NOT NULL) AS sources
    FROM eligible
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
  ["bazaar-facets-v4-sellable-dropship-sample-source"],
  { revalidate: 300 }
);

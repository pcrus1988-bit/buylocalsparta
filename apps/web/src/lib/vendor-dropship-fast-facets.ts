import { unstable_cache } from "next/cache";
import type { VendorDropshipFacets, VendorDropshipFacetOption } from "./vendor-dropship-catalog-page";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type FacetProjectionRow = Readonly<{
  facet_type: "total" | "category" | "brand" | "color" | "size";
  value: string;
  label: string;
  count: number | string;
}>;

function safeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function option(row: FacetProjectionRow): VendorDropshipFacetOption {
  return { value: row.value, label: row.label || row.value, count: safeInt(row.count) };
}

async function readFastVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  if (!productionDatabaseConfigured()) return { total: 0, categories: [], brands: [], colors: [], sizes: [] };

  const result = await getProductionPostgresRuntime().nativePool.query<FacetProjectionRow>(`
    SELECT facets.facet_type,facets.value,facets.label,facets.count
    FROM public.storefront_dropship_vendor_facets facets
    WHERE facets.supplier_id=(
      SELECT ds.id::text
      FROM dropship_suppliers ds
      JOIN vendor_businesses v ON v.id=ds.owner_vendor_id
      WHERE v.public_id=$1
        AND v.status='active'
        AND ds.active=true
      LIMIT 1
    )
    ORDER BY facets.facet_type,facets.label,facets.value
  `, [vendorId]);

  let total = 0;
  const categories: VendorDropshipFacetOption[] = [];
  const brands: VendorDropshipFacetOption[] = [];
  const colors: VendorDropshipFacetOption[] = [];
  const sizes: VendorDropshipFacetOption[] = [];

  for (const row of result.rows) {
    if (row.facet_type === "total") {
      total = safeInt(row.count);
      continue;
    }
    const entry = option(row);
    if (row.facet_type === "category") categories.push(entry);
    else if (row.facet_type === "brand") brands.push(entry);
    else if (row.facet_type === "color") colors.push(entry);
    else if (row.facet_type === "size") sizes.push(entry);
  }

  return { total, categories, brands, colors, sizes };
}

const cachedFastVendorDropshipFacets = unstable_cache(
  readFastVendorDropshipFacets,
  ["vendor-dropship-storefront-preaggregated-facets-v4"],
  { revalidate: 300 }
);

export function getFastVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  return cachedFastVendorDropshipFacets(vendorId);
}

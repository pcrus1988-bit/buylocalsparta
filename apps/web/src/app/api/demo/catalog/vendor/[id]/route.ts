import {
  getDemoStorefrontVendor,
  getDemoVendorCatalogFacets,
  getDemoVendorCatalogPage,
  type DemoCatalogSort
} from "../../../../../../lib/demo-storefront";

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

function optionalParam(url: URL, key: string, max: number): string {
  return url.searchParams.get(key)?.trim().slice(0, max) ?? "";
}

function multiParam(url: URL, key: string, max: number, limit = 64): readonly string[] {
  return [...new Set(url.searchParams.getAll(key).map((value) => value.trim().slice(0, max)).filter(Boolean))].slice(0, limit);
}

function intParam(url: URL, key: string, fallback: number, max: number): number {
  const parsed = Number(url.searchParams.get(key));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

function sortParam(url: URL): DemoCatalogSort {
  const value = optionalParam(url, "sort", 24);
  if (value === "price_asc" || value === "price_desc" || value === "name_asc") return value;
  return "recommended";
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(id)) {
    return Response.json({ error: "invalid_vendor" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const vendor = await getDemoStorefrontVendor(id);
    if (!vendor) {
      return Response.json({ error: "demo_vendor_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const url = new URL(request.url);
    const includeFacets = url.searchParams.get("facets") === "1";
    const facetsOnly = includeFacets && url.searchParams.get("facetsOnly") === "1";

    if (facetsOnly) {
      const facets = await getDemoVendorCatalogFacets(vendor);
      return Response.json({
        vendorId: vendor.id,
        products: [],
        total: facets.total,
        offset: 0,
        limit: 0,
        nextOffset: null,
        facets
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const offset = intParam(url, "offset", 0, 100_000);
    const limit = Math.max(1, intParam(url, "limit", 20, 60));
    const page = await getDemoVendorCatalogPage(vendor, {
      query: optionalParam(url, "q", 160),
      categories: multiParam(url, "category", 120),
      brand: optionalParam(url, "brand", 160),
      sort: sortParam(url),
      offset,
      limit
    });

    return Response.json({
      vendorId: vendor.id,
      products: page.products,
      total: page.total,
      offset: page.offset,
      limit: page.limit,
      nextOffset: page.nextOffset,
      facets: null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "demo_storefront.catalog_api_failed",
      vendorId: id,
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ error: "demo_catalogue_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

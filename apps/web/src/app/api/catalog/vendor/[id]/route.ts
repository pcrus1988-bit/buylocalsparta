import { getVendorDropshipCatalogPage } from "../../../../../lib/vendor-dropship-catalog-page";
import { getFastVendorDropshipCatalogPage } from "../../../../../lib/vendor-dropship-fast-page";
import { getFastVendorDropshipFacets } from "../../../../../lib/vendor-dropship-fast-facets";

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

function optionalParam(url: URL, key: string, max: number): string {
  return url.searchParams.get(key)?.trim().slice(0, max) ?? "";
}

function intParam(url: URL, key: string, fallback: number, max: number): number {
  const parsed = Number(url.searchParams.get(key));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(id)) {
    return Response.json({ error: "invalid_vendor" }, { status: 400 });
  }

  const url = new URL(request.url);
  const query = optionalParam(url, "q", 160);
  const category = optionalParam(url, "category", 120);
  const brand = optionalParam(url, "brand", 160);
  const color = optionalParam(url, "color", 120);
  const size = optionalParam(url, "size", 120);
  const offset = intParam(url, "offset", 0, 100_000);
  const limit = Math.max(1, intParam(url, "limit", 20, 60));
  const availableOnly = url.searchParams.get("available") === "1";
  const includeFacets = url.searchParams.get("facets") === "1";
  const facetsOnly = includeFacets && url.searchParams.get("facetsOnly") === "1";

  try {
    if (facetsOnly) {
      const facets = await getFastVendorDropshipFacets(id);
      return Response.json({
        vendorId: id,
        products: [],
        total: facets.total,
        offset: 0,
        limit: 0,
        nextOffset: null,
        facets
      }, {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=300"
        }
      });
    }

    const useFastInitialPath = !includeFacets
      && !query
      && !category
      && !brand
      && !color
      && !size
      && !availableOnly;

    const page = useFastInitialPath
      ? await getFastVendorDropshipCatalogPage(id, { offset, limit })
      : await getVendorDropshipCatalogPage(id, {
          query,
          category,
          brand,
          color,
          size,
          availableOnly,
          offset,
          limit
        });
    const facets = includeFacets ? await getFastVendorDropshipFacets(id) : undefined;
    const total = "total" in page ? page.total : undefined;

    return Response.json({
      vendorId: id,
      products: page.products,
      total,
      offset: page.offset,
      limit: page.limit,
      nextOffset: page.nextOffset ?? null,
      facets: facets ?? null
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.vendor_catalog_api_failed",
      vendorId: id,
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ error: "catalogue_unavailable" }, { status: 503 });
  }
}

import { getVendorDropshipCatalogPage } from "../../../../../lib/vendor-dropship-catalog-page";
import { getFastVendorDropshipCatalogPage } from "../../../../../lib/vendor-dropship-fast-page";
import { getFastVendorDropshipFacets } from "../../../../../lib/vendor-dropship-fast-facets";

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

const PAGE_BROWSER_CACHE = "public, max-age=5";
const PAGE_SHARED_CACHE = "public, max-age=15";
const PAGE_VERCEL_CACHE = "public, max-age=30";
const FACET_BROWSER_CACHE = "public, max-age=30";
const FACET_SHARED_CACHE = "public, max-age=120";
const FACET_VERCEL_CACHE = "public, max-age=300";

function optionalParam(url: URL, key: string, max: number): string {
  return url.searchParams.get(key)?.trim().slice(0, max) ?? "";
}

function intParam(url: URL, key: string, fallback: number, max: number): number {
  const parsed = Number(url.searchParams.get(key));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

async function optionalFacets(vendorId: string) {
  try {
    return await getFastVendorDropshipFacets(vendorId);
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "storefront.vendor_catalog_facets_degraded",
      vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return undefined;
  }
}

function publicCacheHeaders(facetsOnly = false): HeadersInit {
  return facetsOnly ? {
    "Cache-Control": FACET_BROWSER_CACHE,
    "CDN-Cache-Control": FACET_SHARED_CACHE,
    "Vercel-CDN-Cache-Control": FACET_VERCEL_CACHE
  } : {
    "Cache-Control": PAGE_BROWSER_CACHE,
    "CDN-Cache-Control": PAGE_SHARED_CACHE,
    "Vercel-CDN-Cache-Control": PAGE_VERCEL_CACHE
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(id)) {
    return Response.json({ error: "invalid_vendor" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  const query = optionalParam(url, "q", 160);
  const category = optionalParam(url, "category", 120);
  const brand = optionalParam(url, "brand", 160);
  const color = optionalParam(url, "color", 120);
  const size = optionalParam(url, "size", 120);
  const offset = intParam(url, "offset", 0, 100_000);
  const limit = Math.max(1, intParam(url, "limit", 20, 60));
  // Customer-facing dropship catalogues must never expose unavailable supplier stock.
  // Keep the query parameter out of this policy: availability is a storefront invariant.
  const availableOnly = true;
  const includeFacets = url.searchParams.get("facets") === "1";
  const facetsOnly = includeFacets && url.searchParams.get("facetsOnly") === "1";

  try {
    if (facetsOnly) {
      const facets = await optionalFacets(id);
      return Response.json({
        vendorId: id,
        products: [],
        total: facets?.total,
        offset: 0,
        limit: 0,
        nextOffset: null,
        facets: facets ?? null
      }, { headers: publicCacheHeaders(true) });
    }

    const useFastInitialPath = !includeFacets
      && !query
      && !category
      && !brand
      && !color
      && !size;

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
    const facets = includeFacets ? await optionalFacets(id) : undefined;
    const total = "total" in page ? page.total : undefined;

    return Response.json({
      vendorId: id,
      products: page.products,
      total,
      offset: page.offset,
      limit: page.limit,
      nextOffset: page.nextOffset ?? null,
      facets: facets ?? null
    }, { headers: publicCacheHeaders(false) });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.vendor_catalog_api_failed",
      vendorId: id,
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ error: "catalogue_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

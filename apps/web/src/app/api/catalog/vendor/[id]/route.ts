import { decodeCatalogSizeGroup } from "../../../../../lib/catalog-size";
import { getVendorDropshipCatalogPage, getVendorDropshipFacets, type VendorDropshipSort } from "../../../../../lib/vendor-dropship-catalog-page";
import { getContextualVendorDropshipFacets, type VendorDropshipFacetContext } from "../../../../../lib/vendor-dropship-contextual-facets";
import { getFastVendorDropshipCatalogPage } from "../../../../../lib/vendor-dropship-fast-page";

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

const PAGE_BROWSER_CACHE = "public, max-age=5";
const PAGE_SHARED_CACHE = "public, max-age=15";
const PAGE_VERCEL_CACHE = "public, max-age=30";
const FACET_BROWSER_CACHE = "public, max-age=15";
const FACET_SHARED_CACHE = "public, max-age=60";
const FACET_VERCEL_CACHE = "public, max-age=120";

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

function sortParam(url: URL): VendorDropshipSort {
  const value = optionalParam(url, "sort", 24);
  if (value === "price_asc" || value === "price_desc" || value === "name_asc") return value;
  return "recommended";
}

function emptyFacetContext(context: VendorDropshipFacetContext): boolean {
  return !(context.query?.trim()
    || context.categories?.length
    || context.brand?.trim()
    || context.color?.trim()
    || context.sizes?.length
    || context.fit?.trim()
    || context.material?.trim());
}

async function optionalFacets(vendorId: string, context: VendorDropshipFacetContext) {
  // Initial storefront/fashion-guide facet loads must stay on the small
  // pre-aggregated projection. Falling through to the live contextual query when
  // that projection is temporarily empty reconstructs facets across the supplier
  // catalogue and can consume the single web DB connection until acquisition
  // timeouts cascade into the product page request. An empty projection is a
  // valid degraded response; Agent 3 owns keeping the projection refreshed.
  if (emptyFacetContext(context)) {
    try {
      const preaggregated = await getVendorDropshipFacets(vendorId);
      if (preaggregated.total === 0 && preaggregated.categories.length === 0) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "storefront.vendor_catalog_facets_preaggregated_empty",
          vendorId
        }));
      }
      return preaggregated;
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "storefront.vendor_catalog_facets_preaggregated_failed",
        vendorId,
        message: error instanceof Error ? error.message : String(error)
      }));
      return undefined;
    }
  }

  try {
    return await getContextualVendorDropshipFacets(vendorId, context);
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
  const categories = multiParam(url, "category", 120);
  const brand = optionalParam(url, "brand", 160);
  const color = optionalParam(url, "color", 120);
  const sizes = [...new Set(multiParam(url, "size", 512).flatMap((value) => decodeCatalogSizeGroup(value)).map((value) => value.slice(0, 120)))].slice(0, 64);
  const fit = optionalParam(url, "fit", 120);
  const material = optionalParam(url, "material", 120);
  const sort = sortParam(url);
  const offset = intParam(url, "offset", 0, 100_000);
  const limit = Math.max(1, intParam(url, "limit", 20, 60));
  const availableOnly = true;
  const includeFacets = url.searchParams.get("facets") === "1";
  const facetsOnly = includeFacets && url.searchParams.get("facetsOnly") === "1";
  const facetContext = { query, categories, brand, color, sizes, fit, material } satisfies VendorDropshipFacetContext;

  try {
    if (facetsOnly) {
      const facets = await optionalFacets(id, facetContext);
      if (!facets) {
        return Response.json(
          { error: "catalogue_facets_unavailable" },
          { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "1" } }
        );
      }
      return Response.json({
        vendorId: id,
        products: [],
        total: facets.total,
        offset: 0,
        limit: 0,
        nextOffset: null,
        facets
      }, { headers: publicCacheHeaders(true) });
    }

    const useFastInitialPath = !includeFacets
      && !query
      && categories.length === 0
      && !brand
      && !color
      && sizes.length === 0
      && !fit
      && !material
      && sort === "recommended";

    const page = useFastInitialPath
      ? await getFastVendorDropshipCatalogPage(id, { offset, limit })
      : await getVendorDropshipCatalogPage(id, {
          query,
          categories,
          brand,
          color,
          sizes,
          fit,
          material,
          sort,
          availableOnly,
          offset,
          limit
        });
    const facets = includeFacets ? await optionalFacets(id, facetContext) : undefined;
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

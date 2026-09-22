import { decodeCatalogSizeGroup } from "../../../../../lib/catalog-size";
import {
  getVendorDropshipCatalogPage,
  getVendorDropshipFacets,
  type VendorDropshipFacetOption,
  type VendorDropshipFacets,
  type VendorDropshipSort
} from "../../../../../lib/vendor-dropship-catalog-page";
import { getContextualVendorDropshipFacets, type VendorDropshipFacetContext } from "../../../../../lib/vendor-dropship-contextual-facets";
import { getFastVendorDropshipCatalogPage } from "../../../../../lib/vendor-dropship-fast-page";
import { getVendorLocalCatalogFacets, getVendorLocalCatalogPage } from "../../../../../lib/vendor-local-catalog-page";

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

function mergeFacetOptions(
  left: readonly VendorDropshipFacetOption[],
  right: readonly VendorDropshipFacetOption[]
): readonly VendorDropshipFacetOption[] {
  const merged = new Map<string, VendorDropshipFacetOption>();
  for (const entry of [...left, ...right]) {
    const key = entry.value.trim().toLocaleLowerCase("el");
    if (!key) continue;
    const current = merged.get(key);
    merged.set(key, {
      value: current?.value ?? entry.value,
      label: current?.label ?? entry.label,
      count: (current?.count ?? 0) + entry.count
    });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "el"));
}

function mergeFacets(local: VendorDropshipFacets, dropship?: VendorDropshipFacets): VendorDropshipFacets {
  if (!dropship) return local;
  return {
    total: local.total + dropship.total,
    categories: mergeFacetOptions(local.categories, dropship.categories),
    brands: mergeFacetOptions(local.brands, dropship.brands),
    colors: mergeFacetOptions(local.colors, dropship.colors),
    sizes: mergeFacetOptions(local.sizes, dropship.sizes),
    fits: mergeFacetOptions(local.fits, dropship.fits),
    materials: mergeFacetOptions(local.materials, dropship.materials)
  };
}

async function optionalDropshipFacets(vendorId: string, context: VendorDropshipFacetContext) {
  if (emptyFacetContext(context)) {
    try {
      const preaggregated = await getVendorDropshipFacets(vendorId);
      if (preaggregated.total > 0 || preaggregated.categories.length > 0) return preaggregated;
      console.warn(JSON.stringify({
        level: "warn",
        event: "storefront.vendor_catalog_facets_preaggregated_empty",
        vendorId
      }));
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "storefront.vendor_catalog_facets_preaggregated_failed",
        vendorId,
        message: error instanceof Error ? error.message : String(error)
      }));
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

async function optionalFacets(vendorId: string, context: VendorDropshipFacetContext) {
  const local = await getVendorLocalCatalogFacets(vendorId).catch((error) => {
    console.error(JSON.stringify({
      level: "warn",
      event: "storefront.vendor_local_catalog_facets_failed",
      vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return { total: 0, categories: [], brands: [], colors: [], sizes: [], fits: [], materials: [] } satisfies VendorDropshipFacets;
  });
  const dropship = await optionalDropshipFacets(vendorId, context);
  if (!dropship && local.total === 0) return undefined;
  return mergeFacets(local, dropship);
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
  const localAvailableOnly = url.searchParams.get("available") === "1";
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

    const local = await getVendorLocalCatalogPage(id, {
      query,
      categories,
      brand,
      color,
      sizes,
      fit,
      material,
      sort,
      availableOnly: localAvailableOnly,
      offset,
      limit
    });

    let products = [...local.products];
    let responseOffset = offset;
    let responseLimit = limit;
    let nextOffset: number | null = local.nextOffset ?? null;
    let total: number | undefined = local.hasDropship ? undefined : local.total;

    if (local.hasDropship) {
      // Keep local catalogue products first so a merchant's own assortment is
      // never displaced by a large supplier feed. Supplier pages continue from
      // the global offset after the local window is exhausted.
      if (offset >= local.total) {
        const dropshipOffset = offset - local.total;
        const dropship = useFastInitialPath
          ? await getFastVendorDropshipCatalogPage(id, { offset: dropshipOffset, limit })
          : await getVendorDropshipCatalogPage(id, {
              query,
              categories,
              brand,
              color,
              sizes,
              fit,
              material,
              sort,
              availableOnly: true,
              offset: dropshipOffset,
              limit
            });
        products = [...dropship.products];
        nextOffset = dropship.nextOffset === undefined ? null : local.total + dropship.nextOffset;
        total = "total" in dropship ? local.total + dropship.total : undefined;
      } else if (products.length < limit && local.nextOffset === undefined) {
        const remaining = limit - products.length;
        const dropship = useFastInitialPath
          ? await getFastVendorDropshipCatalogPage(id, { offset: 0, limit: remaining })
          : await getVendorDropshipCatalogPage(id, {
              query,
              categories,
              brand,
              color,
              sizes,
              fit,
              material,
              sort,
              availableOnly: true,
              offset: 0,
              limit: remaining
            });
        products = [...products, ...dropship.products];
        nextOffset = dropship.nextOffset === undefined ? null : offset + products.length;
        total = "total" in dropship ? local.total + dropship.total : undefined;
      }
    } else if (local.total === 0) {
      const dropship = useFastInitialPath
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
            availableOnly: true,
            offset,
            limit
          });
      products = [...dropship.products];
      responseOffset = dropship.offset;
      responseLimit = dropship.limit;
      nextOffset = dropship.nextOffset ?? null;
      total = "total" in dropship ? dropship.total : undefined;
    }

    const facets = includeFacets ? await optionalFacets(id, facetContext) : undefined;
    return Response.json({
      vendorId: id,
      products,
      total,
      offset: responseOffset,
      limit: responseLimit,
      nextOffset,
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

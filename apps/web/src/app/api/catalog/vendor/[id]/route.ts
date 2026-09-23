import type { CatalogCard } from "../../../../../lib/catalog-view";
import { decodeCatalogSizeGroup } from "../../../../../lib/catalog-size";
import { getVendorDropshipCatalogPage, getVendorDropshipFacets, type VendorDropshipFacets, type VendorDropshipSort } from "../../../../../lib/vendor-dropship-catalog-page";
import { getContextualVendorDropshipFacets, type VendorDropshipFacetContext } from "../../../../../lib/vendor-dropship-contextual-facets";
import { getFastVendorDropshipCatalogPage } from "../../../../../lib/vendor-dropship-fast-page";
import { getVendorLocalCatalogCards, getVendorLocalCatalogFacetCards, getVendorLocalCatalogPage } from "../../../../../lib/vendor-local-catalog";

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

function normalized(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("el");
}

function localMatches(product: CatalogCard, context: VendorDropshipFacetContext, availableOnly: boolean): boolean {
  if (availableOnly && !product.available) return false;
  if (context.categories?.length && !context.categories.includes(product.categoryCode)) return false;
  if (context.brand?.trim() && normalized(product.brand) !== normalized(context.brand)) return false;
  if (context.color?.trim() && normalized(product.color) !== normalized(context.color)) return false;
  if (context.sizes?.length) {
    const sizes = new Set((product.sizes ?? []).map((value) => normalized(value)));
    if (!context.sizes.some((value) => sizes.has(normalized(value)))) return false;
  }
  if (context.fit?.trim() && normalized(product.fit) !== normalized(context.fit)) return false;
  if (context.material?.trim() && !normalized(product.composition).includes(normalized(context.material))) return false;
  if (context.query?.trim()) {
    const haystack = normalized([
      product.title,
      product.brand,
      product.description,
      product.gtin,
      product.mpn,
      product.categoryLabel,
      product.categoryCode
    ].filter(Boolean).join(" "));
    if (!haystack.includes(normalized(context.query))) return false;
  }
  return true;
}

function sortLocal(products: readonly CatalogCard[], sort: VendorDropshipSort): CatalogCard[] {
  const sorted = [...products];
  if (sort === "price_asc") return sorted.sort((a, b) => a.priceMinor - b.priceMinor || a.title.localeCompare(b.title, "el"));
  if (sort === "price_desc") return sorted.sort((a, b) => b.priceMinor - a.priceMinor || a.title.localeCompare(b.title, "el"));
  if (sort === "name_asc") return sorted.sort((a, b) => a.title.localeCompare(b.title, "el"));
  return sorted.sort((a, b) => Number(b.available) - Number(a.available) || a.title.localeCompare(b.title, "el"));
}

function facet(values: readonly { value?: string; label?: string }[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const entry of values) {
    const value = entry.value?.trim();
    if (!value) continue;
    const current = counts.get(value);
    counts.set(value, { label: entry.label?.trim() || value, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.entries()]
    .map(([value, entry]) => ({ value, label: entry.label, count: entry.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "el"));
}

function localFacets(products: readonly CatalogCard[]): VendorDropshipFacets {
  return {
    total: products.length,
    categories: facet(products.map((product) => ({ value: product.categoryCode, label: product.categoryLabel ?? product.categoryCode }))),
    brands: facet(products.map((product) => ({ value: product.brand, label: product.brand }))),
    colors: facet(products.map((product) => ({ value: product.color, label: product.color }))),
    sizes: facet(products.flatMap((product) => (product.sizes ?? []).map((size) => ({ value: size, label: size })))),
    fits: facet(products.map((product) => ({ value: product.fit, label: product.fit }))),
    materials: []
  };
}

function mergeFacetOptions(
  left: VendorDropshipFacets["categories"],
  right: VendorDropshipFacets["categories"]
): VendorDropshipFacets["categories"] {
  const merged = new Map<string, { value: string; label: string; count: number }>();
  for (const entry of [...left, ...right]) {
    const current = merged.get(entry.value);
    merged.set(entry.value, {
      value: entry.value,
      label: current?.label || entry.label,
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

async function optionalFacets(vendorId: string, context: VendorDropshipFacetContext) {
  // The live family projection is the source of truth for what can be shown now.
  // The preaggregated facet table may lag supplier stock refreshes by hours or days,
  // so use it only as a resilience fallback when the live projection is unavailable.
  try {
    return await getContextualVendorDropshipFacets(vendorId, context);
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "storefront.vendor_catalog_facets_live_failed",
      vendorId,
      message: error instanceof Error ? error.message : String(error)
    }));
  }

  if (emptyFacetContext(context)) {
    try {
      const preaggregated = await getVendorDropshipFacets(vendorId);
      if (preaggregated.total > 0 || preaggregated.categories.length > 0) {
        return preaggregated;
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "storefront.vendor_catalog_facets_preaggregated_failed",
        vendorId,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  return undefined;
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
  const useFastInitialPath = !includeFacets
    && !query
    && categories.length === 0
    && !brand
    && !color
    && sizes.length === 0
    && !fit
    && !material
    && sort === "recommended";

  try {
    if (useFastInitialPath) {
      const localPage = await getVendorLocalCatalogPage(id, {
        offset,
        limit,
        availableOnly: localAvailableOnly
      });
      const localCount = localPage.total;
      const localProducts = localPage.products;
      const remaining = Math.max(0, limit - localProducts.length);
      const dropshipOffset = Math.max(0, offset - localCount);

      // If this page is wholly inside the local assortment, do not touch the
      // supplier catalogue at all. Previously the route still ran a one-product
      // dropship query and discarded it, making the first local/VITEX pages pay
      // the cost of sorting the entire live supplier projection.
      if (remaining === 0 && offset + limit < localCount) {
        return Response.json({
          vendorId: id,
          products: localProducts,
          offset,
          limit,
          nextOffset: offset + limit,
          facets: null
        }, { headers: publicCacheHeaders(false) });
      }

      // At an exact local/dropship boundary we probe one supplier row only so we
      // do not advertise a next page that cannot exist. Boundary pages that need
      // supplier rows request only the number of cards still missing.
      const requestedDropshipLimit = remaining > 0 ? remaining : 1;
      const dropshipPage = await getFastVendorDropshipCatalogPage(id, {
        offset: dropshipOffset,
        limit: requestedDropshipLimit
      });
      const products = remaining > 0
        ? [...localProducts, ...dropshipPage.products.slice(0, remaining)]
        : localProducts;
      const hasDropshipAtBoundary = dropshipPage.products.length > 0 || dropshipPage.nextOffset !== undefined;
      const nextOffset = remaining === 0
        ? (hasDropshipAtBoundary ? localCount : null)
        : dropshipPage.nextOffset !== undefined
          ? localCount + dropshipPage.nextOffset
          : null;

      return Response.json({
        vendorId: id,
        products,
        offset,
        limit,
        nextOffset,
        facets: null
      }, { headers: publicCacheHeaders(false) });
    }
    const allLocal = facetsOnly
      ? await getVendorLocalCatalogFacetCards(id)
      : await getVendorLocalCatalogCards(id);
    const matchingLocal = sortLocal(
      allLocal.filter((product) => localMatches(product, facetContext, localAvailableOnly)),
      sort
    );
    const localFacetProjection = localFacets(
      allLocal.filter((product) => localMatches(product, facetContext, false))
    );

    if (facetsOnly) {
      const dropshipFacets = await optionalFacets(id, facetContext);
      const facets = mergeFacets(localFacetProjection, dropshipFacets);
      if (!dropshipFacets && facets.total === 0) {
        return Response.json(
          { error: "catalogue_facets_unavailable" },
          {
            status: 503,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": "1"
            }
          }
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

    const localCount = matchingLocal.length;
    const localProducts = offset < localCount
      ? matchingLocal.slice(offset, Math.min(localCount, offset + limit))
      : [];
    const remaining = Math.max(0, limit - localProducts.length);
    const dropshipOffset = Math.max(0, offset - localCount);
    const dropshipLimit = Math.max(1, remaining || 1);

    const dropshipPage = await getVendorDropshipCatalogPage(id, {
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
          limit: dropshipLimit
        });

    const products = remaining > 0
      ? [...localProducts, ...dropshipPage.products.slice(0, remaining)]
      : localProducts;
    const dropshipTotal = "total" in dropshipPage ? Number(dropshipPage.total) : undefined;
    const total = dropshipTotal !== undefined && Number.isFinite(dropshipTotal)
      ? localCount + dropshipTotal
      : undefined;
    const nextOffset = total !== undefined
      ? (offset + limit < total ? offset + limit : null)
      : null;
    const dropshipFacets = includeFacets ? await optionalFacets(id, facetContext) : undefined;
    const facets = includeFacets ? mergeFacets(localFacetProjection, dropshipFacets) : undefined;

    return Response.json({
      vendorId: id,
      products,
      ...(total !== undefined ? { total } : {}),
      offset,
      limit,
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

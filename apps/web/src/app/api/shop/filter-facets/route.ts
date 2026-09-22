import { getCachedShopFilterSheetTaxonomy } from "../../../../lib/cached-shop-taxonomy";

function optionalParam(url: URL, key: string, maxLength: number): string {
  return url.searchParams.get(key)?.trim().slice(0, maxLength) ?? "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = optionalParam(url, "category", 120);
  const query = optionalParam(url, "q", 160);
  const filters = {
    subcategory: optionalParam(url, "subcategory", 120) || undefined,
    brand: optionalParam(url, "brand", 160) || undefined,
    color: optionalParam(url, "color", 120) || undefined,
    size: optionalParam(url, "size", 512) || undefined
  };

  try {
    const taxonomy = await getCachedShopFilterSheetTaxonomy(category, query, filters, "23100");
    return Response.json({
      facets: taxonomy.facets
    }, {
      headers: {
        "Cache-Control": "public, max-age=30",
        "CDN-Cache-Control": "public, max-age=180",
        "Vercel-CDN-Cache-Control": "public, max-age=300"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.shop_filter_facets_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json(
      { error: "filter_facets_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "1" } }
    );
  }
}

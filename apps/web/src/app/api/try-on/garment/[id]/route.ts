import { getPublicCatalogSourceImageAtIndex } from "../../../../../lib/public-catalog-source-gallery";
import { issueTryOnGarmentProxyToken } from "../../../../../lib/try-on-garment-proxy";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const productId = id.trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(productId)) {
    return new Response("Product image not found.\n", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const source = await getPublicCatalogSourceImageAtIndex(productId, 0);
    if (!source?.src) {
      return new Response("Product image not found.\n", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const token = await issueTryOnGarmentProxyToken(source.src);
    const target = new URL("/api/try-on/garment-proxy", request.url);
    target.searchParams.set("token", token);
    return new Response(null, {
      status: 307,
      headers: {
        "Location": target.toString(),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex"
      }
    });
  } catch {
    return new Response("Product image temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "30",
        "X-Robots-Tag": "noindex"
      }
    });
  }
}

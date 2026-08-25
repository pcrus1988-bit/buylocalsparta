import { getPublicProductSeoSummary } from "../../../../lib/catalog-view";

const MAX_CART_ITEMS = 100;

async function requestedIds(request: Request): Promise<readonly string[]> {
  try {
    const body = await request.json() as { ids?: unknown };
    if (!Array.isArray(body.ids)) return [];
    return [...new Set(body.ids
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 128))]
      .slice(0, MAX_CART_ITEMS);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const ids = await requestedIds(request);
  if (ids.length === 0) return Response.json({ items: [] });

  const products = await Promise.all(ids.map(async (id) => {
    try {
      return await getPublicProductSeoSummary(id);
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "cart.product_details_failed",
        canonicalVariantId: id,
        message: error instanceof Error ? error.message : String(error)
      }));
      return undefined;
    }
  }));

  return Response.json({
    items: products.flatMap((product) => product ? [{
      canonicalVariantId: product.id,
      imageUrl: product.mediaId
        ? `/api/media/${encodeURIComponent(product.mediaId)}`
        : product.sourceImageAvailable
          ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
          : undefined,
      imageAlt: product.mediaAlt ?? product.title,
      sku: product.mpn,
      gtin: product.gtin,
      color: product.color,
      size: product.sizes.length ? product.sizes.join(", ") : undefined
    }] : [])
  });
}

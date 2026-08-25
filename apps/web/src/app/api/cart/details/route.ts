import { getPublicProductSeoSummary } from "../../../../lib/catalog-view";

const MAX_CART_ITEMS = 100;

function requestedIds(request: Request): readonly string[] {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  return [...new Set(raw.split(",").map((value) => value.trim()).filter((value) => value.length > 0 && value.length <= 128))].slice(0, MAX_CART_ITEMS);
}

export async function GET(request: Request) {
  const ids = requestedIds(request);
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

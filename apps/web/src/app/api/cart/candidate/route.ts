import { resolveCatalogColor } from "@buy-local-sparta/core";
import { getCatalogCard } from "../../../../lib/catalog-view";
import { getPublicProductDetail } from "../../../../lib/public-product-detail";
import { getVisitorKey } from "../../../../lib/visitor";
import { productPublicPath } from "../../../../lib/product-url";

function requestedId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) return undefined;
  return normalized;
}

export async function POST(request: Request) {
  let id: string | undefined;
  try {
    const body = await request.json() as { id?: unknown };
    id = requestedId(body.id);
  } catch {
    id = undefined;
  }

  if (!id) return Response.json({ error: "invalid_variant" }, { status: 400 });

  try {
    const product = await getCatalogCard(id, await getVisitorKey());
    if (!product) return Response.json({ error: "variant_not_found" }, { status: 404 });
    if (!product.available || product.availableToSell < 1 || product.priceMinor <= 0) {
      return Response.json({ error: "variant_unavailable" }, { status: 409 });
    }

    const detail = await getPublicProductDetail(product.id);
    const meaningfulSizes = product.sizes.filter((size) => !/^(?:o\/?s|os|one\s*size|one-size)$/i.test(size.trim()));
    const color = product.color ? resolveCatalogColor(product.color)?.displayNameEl ?? product.color : undefined;

    return Response.json({
      item: {
        canonicalVariantId: product.id,
        title: product.title,
        priceMinor: product.priceMinor,
        price: product.price,
        imageUrl: product.mediaId
          ? `/api/media/${encodeURIComponent(product.mediaId)}`
          : detail?.sourceImageUrl
            ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
            : undefined,
        imageAlt: product.mediaAlt ?? product.title,
        sku: product.mpn,
        gtin: product.gtin ?? detail?.sourceGtin,
        color,
        size: meaningfulSizes.length === 1 ? meaningfulSizes[0] : undefined,
        brand: product.brand ?? detail?.brand,
        categoryLabel: product.categoryLabel,
        description: product.description ?? detail?.description,
        availableToSell: product.availableToSell,
        url: productPublicPath(product)
      }
    }, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "cart.variant_candidate_failed",
      canonicalVariantId: id,
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ error: "candidate_unavailable" }, { status: 503 });
  }
}

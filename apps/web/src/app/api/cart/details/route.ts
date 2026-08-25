import { getPublicCatalogProducts } from "../../../../lib/catalog-view";
import { loadCatalogMetadata } from "../../../../lib/catalog-metadata";
import { getPublicProductDetails } from "../../../../lib/public-product-detail";
import { approvedCatalogImages, type ApprovedCatalogImage } from "../../../../lib/public-media-service";

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

function clipped(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

export async function POST(request: Request) {
  const ids = await requestedIds(request);
  if (ids.length === 0) return Response.json({ items: [] });

  try {
    const requested = new Set(ids);
    const products = (await getPublicCatalogProducts()).filter((product) => requested.has(product.id));
    const productIds = products.map((product) => product.id);
    if (productIds.length === 0) return Response.json({ items: [] });

    const [metadata, publicDetails] = await Promise.all([
      loadCatalogMetadata(productIds),
      getPublicProductDetails(productIds)
    ]);

    let images: readonly ApprovedCatalogImage[] = [];
    try {
      images = await approvedCatalogImages(productIds.map((canonicalVariantId) => ({ canonicalVariantId })));
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "cart.product_media_batch_failed",
        canonicalVariantCount: productIds.length,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
    const imageByProduct = new Map(images.map((image) => [image.canonicalVariantId, image]));

    return Response.json({
      items: products.map((product) => {
        const details = metadata.get(product.id);
        const publicDetail = publicDetails.get(product.id);
        const image = imageByProduct.get(product.id);
        return {
          canonicalVariantId: product.id,
          imageUrl: image?.mediaId
            ? `/api/media/${encodeURIComponent(image.mediaId)}`
            : publicDetail?.sourceImageUrl
              ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
              : undefined,
          imageAlt: clipped(image?.altText ?? product.title, 500),
          sku: clipped(details?.mpn, 160),
          gtin: clipped(details?.gtin ?? publicDetail?.sourceGtin, 64),
          color: clipped(details?.color, 160),
          size: clipped(details?.sizes.length ? details.sizes.join(", ") : undefined, 240)
        };
      })
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "cart.product_details_batch_failed",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ items: [] });
  }
}

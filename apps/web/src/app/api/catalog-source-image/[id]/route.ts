import { getPublicCatalogSourceImageAtIndex } from "../../../../lib/public-catalog-source-gallery";
import { getPublicProductDetail } from "../../../../lib/public-product-detail";

type Context = { params: Promise<{ id: string }> };

const EMPTY_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>`;

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const canonicalVariantId = id.trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(canonicalVariantId)) return emptyImage();

  try {
    const url = new URL(request.url);
    const requestedIndex = url.searchParams.get("index");
    let sourceImageUrl: string | undefined;

    if (requestedIndex !== null) {
      const index = Number(requestedIndex);
      if (!Number.isSafeInteger(index) || index < 0 || index > 11) return emptyImage();
      sourceImageUrl = (await getPublicCatalogSourceImageAtIndex(canonicalVariantId, index))?.src;
    } else {
      sourceImageUrl = (await getPublicProductDetail(canonicalVariantId))?.sourceImageUrl;
    }

    if (!sourceImageUrl) return emptyImage();

    return new Response(null, {
      status: 307,
      headers: {
        "Location": sourceImageUrl,
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.catalog_source_image_failed",
      canonicalVariantId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return emptyImage();
  }
}

function emptyImage(): Response {
  return new Response(EMPTY_IMAGE, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

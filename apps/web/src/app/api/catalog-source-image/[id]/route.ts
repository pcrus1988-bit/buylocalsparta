import { getPublicCatalogSourceImageAtIndex } from "../../../../lib/public-catalog-source-gallery";

type Context = { params: Promise<{ id: string }> };

// Supplier image locations are effectively immutable for a canonical source row.
// Keep browsers reasonably fresh while letting the edge absorb repeated product-card
// image lookups instead of re-opening PostgreSQL for every short CDN expiry.
const SOURCE_IMAGE_BROWSER_CACHE = "public, max-age=3600";
const SOURCE_IMAGE_CDN_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800, stale-if-error=604800";
const MISSING_CACHE = "public, max-age=60, s-maxage=300";

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const canonicalVariantId = id.trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(canonicalVariantId)) return missingImage();

  try {
    const url = new URL(request.url);
    const requestedIndex = url.searchParams.get("index");
    let sourceImageUrl: string | undefined;

    if (requestedIndex !== null) {
      const index = Number(requestedIndex);
      if (!Number.isSafeInteger(index) || index < 0 || index > 11) return missingImage();
      sourceImageUrl = (await getPublicCatalogSourceImageAtIndex(canonicalVariantId, index))?.src;
    } else {
      sourceImageUrl = (await getPublicCatalogSourceImageAtIndex(canonicalVariantId, 0))?.src;
    }

    if (!sourceImageUrl) return missingImage();

    const upstream = await fetch(sourceImageUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
        "User-Agent": "KONTA-MOU-Product-Media/1.0"
      }
    });
    if (!upstream.ok || !upstream.body) return serviceUnavailable();

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!contentType?.startsWith("image/")) return serviceUnavailable();

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": SOURCE_IMAGE_BROWSER_CACHE,
      "CDN-Cache-Control": SOURCE_IMAGE_CDN_CACHE,
      "Vercel-CDN-Cache-Control": SOURCE_IMAGE_CDN_CACHE,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength)) headers.set("Content-Length", contentLength);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.catalog_source_image_failed",
      canonicalVariantId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return serviceUnavailable();
  }
}

function missingImage(): Response {
  return new Response("Product image not found.\n", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": MISSING_CACHE,
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function serviceUnavailable(): Response {
  return new Response("Product image temporarily unavailable.\n", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "30",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

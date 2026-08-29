import { getMerchantCenterCatalogueProjection, MERCHANT_CENTER_FEED_DESCRIPTION } from "../../../lib/merchant-center-catalog";
import { buildMerchantCenterRss } from "../../../lib/merchant-center-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function xmlResponse(xml: string, itemCount: number): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
      "X-Robots-Tag": "noindex, follow",
      "X-Kontamou-Merchant-Items": String(itemCount)
    }
  });
}

/**
 * Primary Google Merchant Center RSS 2.0 data source.
 *
 * The feed and Admin readiness workspace share one governed catalogue projection.
 * Price and availability come from the read-only crawler commerce view, keeping the
 * data source aligned with public landing pages without consuming fairness state.
 */
export async function GET(): Promise<Response> {
  try {
    const projection = await getMerchantCenterCatalogueProjection();
    if (!projection.feedOperational) throw new Error(projection.operationalError ?? "Merchant Center catalogue projection is unavailable");

    return xmlResponse(buildMerchantCenterRss({
      title: `${projection.siteName} · Merchant Center`,
      link: projection.origin,
      description: MERCHANT_CENTER_FEED_DESCRIPTION,
      products: projection.products
    }), projection.products.length);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "merchant_center.product_feed_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Response("Merchant Center product feed temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  }
}

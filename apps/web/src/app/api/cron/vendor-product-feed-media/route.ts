import { runVendorProductFeedMediaSlice } from "../../../../lib/vendor-product-feed-media-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configured = Number(process.env.BLS_VENDOR_FEED_MEDIA_CRON_PRODUCTS || 2);
    const maxProducts = Number.isSafeInteger(configured) && configured > 0 ? configured : 2;
    const result = await runVendorProductFeedMediaSlice(maxProducts);
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_product_feed_media_failed";
    console.error(JSON.stringify({ level: "error", event: "vendor_product_feed.media_cron_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

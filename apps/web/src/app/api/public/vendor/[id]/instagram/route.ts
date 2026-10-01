import { publicVendorInstagramFeed } from "../../../../../../lib/vendor-instagram-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const feed = await publicVendorInstagramFeed(id);
    return Response.json(feed, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "instagram_feed_failed";
    const status = message === "instagram_feed_not_found" || message === "instagram_feed_disabled" ? 404 : 502;
    return Response.json(
      { error: status === 404 ? "instagram_feed_unavailable" : "instagram_feed_failed" },
      { status, headers: { "Cache-Control": status === 404 ? "public, s-maxage=300" : "no-store" } }
    );
  }
}

import { syncDueVendorProductFeeds } from "../../../../lib/vendor-product-feed-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SCHEDULE = "*/10 * * * *";

export async function GET(request: Request) {
  if (!authorizedSchedulerRequest(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncDueVendorProductFeeds(3);
    return Response.json(result, {
      status: result.failed ? 207 : 200,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", event: "vendor_product_feeds.cron_failed", message }));
    return Response.json({ ok: false, error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

function authorizedSchedulerRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (configuredSecret) return request.headers.get("authorization") === `Bearer ${configuredSecret}`;
  return request.headers.get("user-agent")?.trim().toLowerCase() === "vercel-cron/1.0"
    && request.headers.get("x-vercel-cron-schedule")?.trim() === CRON_SCHEDULE;
}

import { ensureAnalyticsPurchaseKeyEvent } from "../../../../lib/seo-google-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const setup = await ensureAnalyticsPurchaseKeyEvent();
  const log = {
    event: "analytics.purchase_key_event_setup",
    status: setup.status,
    keyEventName: setup.keyEventName,
    error: setup.error
  };

  if (setup.status === "error") {
    console.error(JSON.stringify({ level: "error", ...log }));
    return Response.json({ ok: false, setup }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  console.info(JSON.stringify({ level: "info", ...log }));
  return Response.json({ ok: true, setup }, { status: 200, headers: { "cache-control": "no-store" } });
}

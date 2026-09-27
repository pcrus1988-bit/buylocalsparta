import { runAdaptiveDeliveryDispatcher } from "../../../../lib/delivery-dispatch-runtime";
import { synchronizeDeliveryJobs } from "../../../../lib/delivery-driver-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await synchronizeDeliveryJobs();
    const dispatch = await runAdaptiveDeliveryDispatcher(Date.now(), 16);
    return Response.json({ ok: true, dispatch }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "delivery_dispatch_failed";
    console.error(JSON.stringify({ level: "error", event: "delivery.dispatch_cron_failed", message }));
    return Response.json({ error: message }, { status: 500 });
  }
}

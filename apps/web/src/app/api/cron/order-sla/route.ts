import { runDailyPushDelivery } from "../../../../lib/daily-push";
import { runOrderSlaMonitor } from "../../../../lib/order-sla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const now = Date.now();
    const sla = await runOrderSlaMonitor(now);
    const push = await runDailyPushDelivery(now);
    // Fiscal recovery runs through the dedicated authenticated fiscal-reconciliation
    // scheduler. Running it here as well can duplicate provider verification.
    return Response.json({ ok: true, sla, push }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "order_sla_monitor_failed";
    console.error(JSON.stringify({ level: "error", event: "order_sla.monitor_failed", message }));
    return Response.json({ error: message }, { status: 500 });
  }
}


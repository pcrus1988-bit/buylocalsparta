import { runCustomerFiscalReconciliationSweep } from "../../../../lib/customer-fiscal-reconciliation-sweep";
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
    const fiscal = await fiscalRecoveryBestEffort(now);
    return Response.json({ ok: true, sla, push, fiscal }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "order_sla_monitor_failed";
    console.error(JSON.stringify({ level: "error", event: "order_sla.monitor_failed", message }));
    return Response.json({ error: message }, { status: 500 });
  }
}

async function fiscalRecoveryBestEffort(now: number) {
  try {
    return await runCustomerFiscalReconciliationSweep(now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AADE reconciliation sweep failed";
    console.error(JSON.stringify({ level: "error", event: "customer_tax.reconciliation_sweep_failed", message }));
    return { checked: 0, accepted: 0, emailed: 0, pending: 0, failed: 1, emailFailed: 0, error: message };
  }
}

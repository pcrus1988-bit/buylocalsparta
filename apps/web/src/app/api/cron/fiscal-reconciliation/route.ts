import { runCustomerFiscalReconciliationSweep } from "../../../../lib/customer-fiscal-reconciliation-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorized = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    console.warn(JSON.stringify({
      level: "warning",
      event: "customer_tax.reconciliation_cron_unauthorized",
      secretConfigured: Boolean(secret)
    }));
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const fiscal = await runCustomerFiscalReconciliationSweep(Date.now());
    console.info(JSON.stringify({ level: "info", event: "customer_tax.reconciliation_cron_completed", ...fiscal }));
    return Response.json({ ok: true, fiscal }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AADE reconciliation cron failed";
    console.error(JSON.stringify({ level: "error", event: "customer_tax.reconciliation_cron_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

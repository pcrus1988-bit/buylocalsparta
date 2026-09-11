import { runDropshipOrderReconciliationSweep } from "../../../../lib/dropship-order-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const reconciliation = await runDropshipOrderReconciliationSweep(Date.now());
    console.info(JSON.stringify({
      level: "info",
      event: "dropship.order_reconciliation_completed",
      ...reconciliation
    }));
    return Response.json({ ok: true, reconciliation }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "dropship_order_reconciliation_failed";
    console.error(JSON.stringify({ level: "error", event: "dropship.order_reconciliation_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

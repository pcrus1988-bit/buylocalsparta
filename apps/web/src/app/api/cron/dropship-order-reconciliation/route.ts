import { runDropshipOrderReconciliationSweep } from "../../../../lib/dropship-order-reconciliation";
import { runSymphonyaOrderReconciliationSweep } from "../../../../lib/symphonya-order-reconciliation";
import { runZendropShopifyOrderReconciliationSweep } from "../../../../lib/zendrop-shopify-order-reconciliation";
import { runZendropShopifyInventorySweep } from "../../../../lib/zendrop-shopify-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const now = Date.now();
    const [nova, symphonya, zendrop, zendropInventory] = await Promise.all([
      runDropshipOrderReconciliationSweep(now),
      runSymphonyaOrderReconciliationSweep(now),
      runZendropShopifyOrderReconciliationSweep(now),
      runZendropShopifyInventorySweep(now)
    ]);
    console.info(JSON.stringify({
      level: "info",
      event: "dropship.order_reconciliation_completed",
      nova,
      symphonya,
      zendrop,
      zendropInventory
    }));
    return Response.json({ ok: true, reconciliation: { nova, symphonya, zendrop, zendropInventory } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "dropship_order_reconciliation_failed";
    console.error(JSON.stringify({ level: "error", event: "dropship.order_reconciliation_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

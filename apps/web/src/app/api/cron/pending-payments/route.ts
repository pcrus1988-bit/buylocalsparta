import { runPendingPaymentLifecycle } from "../../../../lib/pending-payment-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const lifecycle = await runPendingPaymentLifecycle(Date.now());
    return Response.json({ ok: true, lifecycle }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "pending_payment_lifecycle_failed";
    console.error(JSON.stringify({ level: "error", event: "pending_payment.lifecycle_failed", message }));
    return Response.json({ error: message }, { status: 500 });
  }
}

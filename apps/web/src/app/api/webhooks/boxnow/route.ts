import { verifyBoxNowWebhook } from "@buy-local-sparta/boxnow-shipping";
import { sendBoxNowCustomerEmail } from "../../../../lib/boxnow-email-notifications";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (process.env.BLS_BOXNOW_ENABLED !== "true") return Response.json({ error: "BOX NOW shipping is disabled" }, { status: 503 });
    const secret = process.env.BOXNOW_WEBHOOK_SECRET?.trim();
    if (!secret) return Response.json({ error: "BOX NOW webhook secret is not configured" }, { status: 503 });
    const raw = await request.text();
    const event = verifyBoxNowWebhook(raw, secret);
    const service = getProductionPostgresRuntime().boxNowShipping;
    if (!service) return Response.json({ error: "BOX NOW shipping runtime is unavailable" }, { status: 503 });
    const result = await service.processWebhook(event, Date.now());
    if (!result.duplicate && !result.stale) {
      await sendBoxNowCustomerEmail({ shipmentId: result.shipmentId, eventId: event.id, event: event.event, parcelId: event.parcelId });
    }
    return Response.json({ ok: true, duplicate: result.duplicate, stale: result.stale });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid BOX NOW webhook" }, { status: 400 });
  }
}

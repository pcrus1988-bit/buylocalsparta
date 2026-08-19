import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { forwardReceivedEmailToOperations, resolveResendWebhookVerifier } from "../../../../lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const service = getProductionPostgresRuntime().notifications;
    if (!service) return Response.json({ error: "Resend delivery is not enabled" }, { status: 503 });

    const payload = await request.text();
    const verifier = await resolveResendWebhookVerifier();
    const event = verifier.verify({
      payload,
      id: request.headers.get("svix-id") ?? undefined,
      timestamp: request.headers.get("svix-timestamp") ?? undefined,
      signature: request.headers.get("svix-signature") ?? undefined,
      now: Date.now()
    });
    const result = await service.processWebhook(event, Date.now());

    let inbound: { forwarded: boolean; providerMessageId?: string } | undefined;
    if (event.type === "email.received" && event.emailId) {
      const receivingEnabled = process.env.BLS_EMAIL_RECEIVING_ENABLED === "true" || Boolean(process.env.RESEND_INBOUND_FORWARD_TO?.trim() || process.env.BLS_OPERATIONS_EMAIL?.trim());
      if (receivingEnabled) {
        inbound = await forwardReceivedEmailToOperations({ webhookEventId: event.id, emailId: event.emailId });
        if (!inbound.forwarded) {
          console.error(JSON.stringify({ level: "error", event: "resend.inbound_no_destination", emailId: event.emailId }));
        }
      }
    }

    return Response.json({ ok: true, duplicate: result.duplicate, inbound });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "resend.webhook_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ error: error instanceof Error ? error.message : "Invalid webhook" }, { status: 400 });
  }
}

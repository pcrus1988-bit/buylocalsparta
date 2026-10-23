import { handleResearchSesSnsWebhook } from "../../../../lib/research-survey-ses-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const result = await handleResearchSesSnsWebhook(payload);
    return Response.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_SES_WEBHOOK_FAILED";
    console.error(JSON.stringify({
      level: "error",
      event: "research.ses_webhook_failed",
      message
    }));
    // SNS must retry transient connection-pool/database failures. Returning 400
    // would acknowledge failure as a permanent bad event and risk lost delivery
    // status. Verified duplicate events remain idempotent in the DB handler.
    const temporarilyUnavailable = /required|DATABASE_UNAVAILABLE|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|connection terminated|too many clients|remaining connection slots/i.test(message);
    return Response.json({ error: temporarilyUnavailable ? "RESEARCH_SES_TEMPORARILY_UNAVAILABLE" : "RESEARCH_SES_EVENT_REJECTED" }, {
      status: temporarilyUnavailable ? 503 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}

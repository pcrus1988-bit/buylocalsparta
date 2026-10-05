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
    return Response.json({ error: message }, {
      status: message.includes("required") || message.includes("DATABASE_UNAVAILABLE") ? 503 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}

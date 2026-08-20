import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import { consumeEmailLabTestSendLimit, maskEmailForAudit, sendEmailLabTest } from "../../../../../lib/email-template-lab";
import { requireAdminSession } from "../../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const body = await request.json() as Record<string, unknown>;
    const to = String(body.to ?? "");
    const eventType = String(body.eventType ?? "");
    const locale = body.locale === "en" ? "en" : "el";
    const purpose = body.purpose === "marketing" ? "marketing" : body.purpose === "service" ? "service" : "transactional";
    const decision = await consumeEmailLabTestSendLimit(principal.userId, Date.now());
    if (!decision.allowed) {
      return Response.json(
        { error: "Too many Email Lab test sends", retryAfterMs: decision.retryAfterMs },
        { status: 429, headers: { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)) } }
      );
    }
    const result = await sendEmailLabTest({
      to,
      eventType,
      locale,
      purpose,
      subject: String(body.subject ?? ""),
      body: String(body.body ?? "")
    });
    await recordAdminAudit(principal, "email_template.test_sent", "notification_template", `${eventType}:${locale}`, "Admin Email Lab test delivery", {
      eventType,
      locale,
      purpose,
      destination: maskEmailForAudit(to),
      providerMessageId: result.providerMessageId
    });
    return Response.json({ ok: true, providerMessageId: result.providerMessageId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "email_template_test_failed" }, { status: 400 });
  }
}

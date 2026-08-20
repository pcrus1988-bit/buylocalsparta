import { recordAdminAudit } from "../../../../lib/admin-runtime";
import {
  emailLabDeliveryConfigured,
  emailTemplateLabCatalog,
  resetEmailTemplateRevision,
  saveEmailTemplateRevision
} from "../../../../lib/email-template-lab";
import { requireAdminSession } from "../../../../lib/admin-session";

export async function GET() {
  try {
    await requireAdminSession(undefined, { permission: "notifications.manage" });
    const templates = await emailTemplateLabCatalog();
    return Response.json({ templates, deliveryConfigured: emailLabDeliveryConfigured() });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 403 });
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const body = await request.json() as Record<string, unknown>;
    const eventType = String(body.eventType ?? "");
    const locale = body.locale === "en" ? "en" : "el";
    const item = await saveEmailTemplateRevision({
      eventType,
      locale,
      subject: String(body.subject ?? ""),
      body: String(body.body ?? ""),
      actorPublicId: principal.userId
    });
    await recordAdminAudit(principal, "email_template.revision_saved", "notification_template", `${eventType}:${locale}`, "Admin Email Lab template revision", {
      eventType,
      locale,
      revision: item.revision,
      variables: item.variables
    });
    return Response.json({ template: item });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const body = await request.json() as Record<string, unknown>;
    const eventType = String(body.eventType ?? "");
    const locale = body.locale === "en" ? "en" : "el";
    await resetEmailTemplateRevision({ eventType, locale });
    await recordAdminAudit(principal, "email_template.reset", "notification_template", `${eventType}:${locale}`, "Admin Email Lab reset to generated copy", { eventType, locale });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : "email_template_lab_failed"; }

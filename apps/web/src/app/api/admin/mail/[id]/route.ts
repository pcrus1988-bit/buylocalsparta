import { requireAdminSession } from "../../../../../lib/admin-session";
import { getAdminMailDetail, updateAdminMailState } from "../../../../../lib/admin-mail-store";
import { recordAdminAudit, recordAdminPersonalDataAccess } from "../../../../../lib/admin-runtime";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { permission: "notifications.manage" });
    const { id } = await context.params;
    const detail = await getAdminMailDetail(id, { markRead: true });
    await recordAdminPersonalDataAccess(principal, {
      route: "/api/admin/mail/[id]",
      resourceType: "admin_mail",
      resourceId: id,
      purpose: "customer_support",
      dataClasses: ["email_address", "email_content", "attachments"],
      recordCount: 1,
      accessScope: "individual"
    }).catch(() => undefined);
    return Response.json({ message: detail }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_mail_detail_failed" }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const patch = {
      ...(typeof body.read === "boolean" ? { read: body.read } : {}),
      ...(typeof body.starred === "boolean" ? { starred: body.starred } : {}),
      ...(typeof body.archived === "boolean" ? { archived: body.archived } : {}),
      ...(typeof body.deleted === "boolean" ? { deleted: body.deleted } : {})
    };
    if (!Object.keys(patch).length) throw new Error("No mailbox state change supplied");
    const state = await updateAdminMailState(id, patch);
    await recordAdminAudit(principal, "admin.mail_state_changed", "admin_mail", id, "Admin mailbox state update", patch);
    return Response.json({ state });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_mail_state_failed" }, { status: 400 });
  }
}

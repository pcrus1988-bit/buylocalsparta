import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { getAdminMailAttachment } from "../../../../../../../lib/admin-mail-store";

export async function GET(request: Request, context: { params: Promise<{ id: string; partIndex: string }> }) {
  try {
    await requireAdminSession(request, { permission: "notifications.manage" });
    const { id, partIndex: rawPartIndex } = await context.params;
    const partIndex = Number(rawPartIndex);
    if (!Number.isSafeInteger(partIndex) || partIndex < 0 || partIndex > 1000) throw new Error("Invalid attachment index");
    const attachment = await getAdminMailAttachment(id, partIndex);
    return new Response(attachment.bytes, {
      headers: {
        "content-type": attachment.contentType || "application/octet-stream",
        "content-disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(attachment.filename),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_mail_attachment_failed" }, { status: 400 });
  }
}

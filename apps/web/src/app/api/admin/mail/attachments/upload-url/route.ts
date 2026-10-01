import { requireAdminSession } from "../../../../../../lib/admin-session";
import { createAdminMailAttachmentUpload } from "../../../../../../lib/admin-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const body = await request.json() as Record<string, unknown>;
    const result = await createAdminMailAttachmentUpload(principal, {
      filename: String(body.filename ?? ""),
      contentType: String(body.contentType ?? "application/octet-stream"),
      byteSize: Number(body.byteSize ?? 0)
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_mail_attachment_upload_failed" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}

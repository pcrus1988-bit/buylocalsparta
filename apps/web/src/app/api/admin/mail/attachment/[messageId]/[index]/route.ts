import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { getAdminMailAttachment } from "../../../../../../../lib/admin-mail-runtime";
import { recordAdminPersonalDataAccess } from "../../../../../../../lib/admin-runtime";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ messageId: string; index: string }> }
) {
  try {
    const principal = await requireAdminSession(request, { permission: "notifications.manage" });
    const { messageId, index } = await context.params;
    if (!/^mail_[a-f0-9]{32}$/i.test(messageId)) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    const attachmentIndex = Number(index);
    if (!Number.isSafeInteger(attachmentIndex) || attachmentIndex < 0 || attachmentIndex > 100) {
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
    }

    const attachment = await getAdminMailAttachment(principal, messageId, attachmentIndex);
    await recordAdminPersonalDataAccess(principal, {
      route: new URL(request.url).pathname,
      resourceType: "admin_mail_attachment",
      resourceId: messageId,
      purpose: "customer_support",
      dataClasses: ["email_content", "attachment"],
      recordCount: 1,
      accessScope: "individual"
    });

    const filename = attachment.filename.replace(/[\r\n"]/g, "").slice(0, 180) || "attachment";
    return new NextResponse(Buffer.from(attachment.bytes), {
      status: 200,
      headers: {
        "content-type": attachment.contentType || "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attachment unavailable";
    const status = message === "ADMIN_AUTH_REQUIRED" ? 401 : message.includes("permission") ? 403 : 404;
    return NextResponse.json({ error: status === 404 ? "Attachment unavailable" : message }, { status });
  }
}

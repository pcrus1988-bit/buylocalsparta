import { NextResponse } from "next/server";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { getAdminMailAttachment } from "../../../../../../../lib/admin-mail-runtime";
import { buildAdminMailAttachmentHeaders } from "../../../../../../../lib/admin-mail-attachment-headers";
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

    return new NextResponse(Buffer.from(attachment.bytes), {
      status: 200,
      headers: buildAdminMailAttachmentHeaders(attachment.filename, attachment.contentType)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attachment unavailable";
    const status = message === "ADMIN_AUTH_REQUIRED"
      ? 401
      : message.includes("permission")
        ? 403
        : /Attachment (source is not available|not found|blocked)/.test(message)
          ? 404
          : 500;
    if (status === 500) console.error("Admin Mail attachment download failed", error);
    return NextResponse.json({
      error: status === 401 ? "Authentication required"
        : status === 403 ? "Permission denied"
          : status === 404 ? "Attachment unavailable" : "Attachment download failed"
    }, { status });
  }
}

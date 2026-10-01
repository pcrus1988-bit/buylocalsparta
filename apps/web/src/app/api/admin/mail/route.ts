import { requireAdminSession } from "../../../../lib/admin-session";
import { adminMailWorkspace, sendAdminMail, type AdminMailFolder } from "../../../../lib/admin-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(undefined, { permission: "notifications.manage" });
    const url = new URL(request.url);
    const folder = (url.searchParams.get("folder") || "inbox") as AdminMailFolder;
    const result = await adminMailWorkspace(principal, {
      folder,
      query: url.searchParams.get("q") || undefined,
      limit: Number(url.searchParams.get("limit") || 60),
      offset: Number(url.searchParams.get("offset") || 0)
    });
    return Response.json(result, { headers: privateHeaders() });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400, headers: privateHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const body = await request.json() as Record<string, unknown>;
    const attachments = Array.isArray(body.attachments) ? body.attachments.map((item) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        objectKey: String(value.objectKey ?? ""),
        filename: String(value.filename ?? ""),
        contentType: String(value.contentType ?? "application/octet-stream"),
        byteSize: Number(value.byteSize ?? 0)
      };
    }) : [];
    const result = await sendAdminMail(principal, {
      to: stringArray(body.to),
      cc: stringArray(body.cc),
      bcc: stringArray(body.bcc),
      subject: String(body.subject ?? ""),
      text: String(body.text ?? ""),
      replyToMessageId: typeof body.replyToMessageId === "string" ? body.replyToMessageId : undefined,
      attachments
    });
    return Response.json(result, { headers: privateHeaders() });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400, headers: privateHeaders() });
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
}
function message(error: unknown): string { return error instanceof Error ? error.message : "admin_mail_failed"; }
function privateHeaders(): Record<string, string> { return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Cookie" }; }

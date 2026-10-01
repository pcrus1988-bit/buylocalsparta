import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { readAdminMailAttachment } from "../../../../../../../lib/admin-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; partIndex: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const principal = await requireAdminSession(undefined, { permission: "notifications.manage" });
    const { id, partIndex } = await context.params;
    const attachment = await readAdminMailAttachment(principal, decodeURIComponent(id), Number(partIndex));
    const body = new Uint8Array(attachment.bytes.byteLength);
    body.set(attachment.bytes);
    return new Response(body.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": attachment.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
}

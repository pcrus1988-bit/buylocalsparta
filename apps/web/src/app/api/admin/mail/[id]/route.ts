import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminMailThread, updateAdminMailMessage } from "../../../../../lib/admin-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const principal = await requireAdminSession(undefined, { permission: "notifications.manage" });
    const { id } = await context.params;
    const result = await adminMailThread(principal, decodeURIComponent(id));
    return Response.json(result, { headers: privateHeaders() });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 404, headers: privateHeaders() });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "") as Parameters<typeof updateAdminMailMessage>[2];
    const allowed = ["mark_read","mark_unread","star","unstar","archive","restore","delete"];
    if (!allowed.includes(action)) throw new Error("Unsupported mailbox action");
    return Response.json(await updateAdminMailMessage(principal, decodeURIComponent(id), action), { headers: privateHeaders() });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400, headers: privateHeaders() });
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : "admin_mail_message_failed"; }
function privateHeaders(): Record<string, string> { return { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", Vary: "Cookie" }; }

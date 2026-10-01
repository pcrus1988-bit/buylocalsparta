import { requireAdminSession } from "../../../../../lib/admin-session";
import { syncAdminInboundMail } from "../../../../../lib/admin-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "notifications.manage" });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const result = await syncAdminInboundMail(principal, { maxObjects: Number(body.maxObjects ?? 100) });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_mail_sync_failed" }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}

import { cookies } from "next/headers";
import { requireAdminSession } from "../../../../lib/admin-session";
import { ADMIN_SESSION_COOKIE, logoutAdmin, recordAdminAudit } from "../../../../lib/admin-runtime";
import { ADMIN_VENDOR_IMPERSONATION_COOKIE } from "../../../../lib/vendor-impersonation";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true });
    const store = await cookies();
    await logoutAdmin(store.get(ADMIN_SESSION_COOKIE)?.value);
    store.delete(ADMIN_SESSION_COOKIE);
    store.delete(ADMIN_VENDOR_IMPERSONATION_COOKIE);
    await recordAdminAudit(principal, "admin.logout", "session", principal.sessionId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "logout_failed" }, { status: 400 });
  }
}

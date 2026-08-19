import { requireVendorSession } from "../../../../lib/vendor-session";
import { createDailyAccess, listDailyAccess, resetDailyPassword, revokeDailyAccess } from "../../../../lib/daily-runtime";

export async function GET() {
  try {
    const principal = await requireVendorSession();
    return Response.json({ accesses: await listDailyAccess(principal), csrfToken: principal.csrfToken });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_access_failed" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as { action?: unknown; accessId?: unknown; email?: unknown; displayName?: unknown; password?: unknown };
    const action = typeof body.action === "string" ? body.action : "create";
    const now = Date.now();
    if (action === "create") {
      const email = typeof body.email === "string" ? body.email : "";
      const displayName = typeof body.displayName === "string" ? body.displayName : "";
      const password = typeof body.password === "string" ? body.password : "";
      const created = await createDailyAccess(principal, { email, displayName, password, now });
      return Response.json({ created, accesses: await listDailyAccess(principal) });
    }
    const accessId = typeof body.accessId === "string" ? body.accessId.trim() : "";
    if (!accessId) throw new Error("Daily access id is required");
    if (action === "revoke") await revokeDailyAccess(principal, accessId, now);
    else if (action === "reset_password") await resetDailyPassword(principal, accessId, typeof body.password === "string" ? body.password : "", now);
    else throw new Error("Unsupported Daily access action");
    return Response.json({ accesses: await listDailyAccess(principal) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_access_failed" }, { status: 400 });
  }
}

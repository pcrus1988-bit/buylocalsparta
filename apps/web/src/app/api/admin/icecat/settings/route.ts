import { adminUpdateIcecatSettings } from "../../../../../lib/admin-icecat-control";
import { requireAdminSession } from "../../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as unknown;
    const workspace = await adminUpdateIcecatSettings(principal, body);
    return Response.json({ ok: true, workspace, applied: "live", propagationSeconds: 5 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "icecat_settings_failed" }, { status: 400 });
  }
}

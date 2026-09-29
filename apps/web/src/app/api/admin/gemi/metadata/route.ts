import { requireAdminSession } from "../../../../../lib/admin-session";
import { gemiAdminMetadata } from "../../../../../lib/gemi-admin-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "vendor.manage" });
    const metadata = await gemiAdminMetadata();
    return Response.json(metadata, {
      status: 200,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load ΓΕΜΗ metadata";
    const status = /AUTH_REQUIRED|permission/i.test(message) ? 403 : 502;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

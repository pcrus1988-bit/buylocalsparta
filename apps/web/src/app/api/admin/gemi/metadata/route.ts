import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  gemiAdminCapabilityCookie,
  issueGemiAdminCapability
} from "../../../../../lib/gemi-admin-capability";
import { gemiAdminMetadata } from "../../../../../lib/gemi-admin-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(request, { permission: "vendor.manage" });
    const issued = await issueGemiAdminCapability(request, principal.userId);
    const metadata = await gemiAdminMetadata(Date.now(), issued.capability.apiKey);
    return Response.json(metadata, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Set-Cookie": gemiAdminCapabilityCookie(issued.token, issued.capability.expiresAt)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load ΓΕΜΗ metadata";
    const status = /AUTH_REQUIRED|permission/i.test(message) ? 403 : 502;
    console.error(JSON.stringify({ level: "error", event: "gemi.admin_metadata_failed", message }));
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

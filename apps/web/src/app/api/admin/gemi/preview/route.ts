import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  gemiAdminCapabilityCookie,
  issueGemiAdminCapability,
  readGemiAdminCapability
} from "../../../../../lib/gemi-admin-capability";
import { gemiAdminPreview, normalizeGemiAdminFilters } from "../../../../../lib/gemi-admin-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let capability = readGemiAdminCapability(request);
    let setCookie: string | undefined;

    if (!capability) {
      const principal = await requireAdminSession(request, { permission: "vendor.manage" });
      const issued = await issueGemiAdminCapability(request, principal.userId);
      capability = issued.capability;
      setCookie = gemiAdminCapabilityCookie(issued.token, issued.capability.expiresAt);
    }

    const url = new URL(request.url);
    const filters = normalizeGemiAdminFilters({
      activityId: url.searchParams.get("activity"),
      prefectureId: url.searchParams.get("prefecture"),
      municipalityId: url.searchParams.get("municipality"),
      activeOnly: url.searchParams.get("activeOnly")
    });
    const preview = await gemiAdminPreview(filters, capability.apiKey);
    return Response.json({ filters, preview }, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        ...(setCookie ? { "Set-Cookie": setCookie } : {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not search ΓΕΜΗ";
    const status = /AUTH_REQUIRED|permission/i.test(message) ? 403 : /required|invalid/i.test(message) ? 400 : 502;
    console.error(JSON.stringify({ level: "error", event: "gemi.admin_preview_failed", message }));
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

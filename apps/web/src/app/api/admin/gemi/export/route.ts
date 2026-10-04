import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  gemiAdminCapabilityCookie,
  issueGemiAdminCapability,
  readGemiAdminCapability
} from "../../../../../lib/gemi-admin-capability";
import {
  gemiAdminCsvFilename,
  gemiAdminCsvStream,
  gemiAdminPreview,
  normalizeGemiAdminFilters
} from "../../../../../lib/gemi-admin-export";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
      activityGroupIds: url.searchParams.get("groups"),
      prefectureId: url.searchParams.get("prefecture"),
      municipalityId: url.searchParams.get("municipality"),
      activeOnly: url.searchParams.get("activeOnly")
    });

    const preview = await gemiAdminPreview(filters, capability.apiKey);
    console.info(JSON.stringify({
      level: "info",
      event: "gemi.admin_csv_export_requested",
      actorUserId: capability.userId,
      activityIds: filters.activityIds,
      activityGroupIds: filters.activityGroupIds,
      prefectureId: filters.prefectureId,
      municipalityId: filters.municipalityId ?? null,
      activeOnly: filters.activeOnly,
      totalCount: preview.totalCount
    }));

    return new Response(gemiAdminCsvStream(filters, capability.apiKey), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${gemiAdminCsvFilename(filters)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-GEMI-Result-Count": String(preview.totalCount),
        ...(setCookie ? { "Set-Cookie": setCookie } : {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export ΓΕΜΗ data";
    const status = /AUTH_REQUIRED|permission/i.test(message) ? 403 : /required|invalid/i.test(message) ? 400 : 502;
    console.error(JSON.stringify({ level: "error", event: "gemi.admin_export_failed", message }));
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

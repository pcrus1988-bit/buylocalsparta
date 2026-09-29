import { recordAdminAudit } from "../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";
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
    const principal = await requireAdminSession(request, { permission: "vendor.manage" });
    const url = new URL(request.url);
    const filters = normalizeGemiAdminFilters({
      activityId: url.searchParams.get("activity"),
      prefectureId: url.searchParams.get("prefecture"),
      municipalityId: url.searchParams.get("municipality"),
      activeOnly: url.searchParams.get("activeOnly")
    });

    const preview = await gemiAdminPreview(filters);
    await recordAdminAudit(
      principal,
      "gemi.csv_export_requested",
      "gemi_search",
      [filters.activityId, filters.prefectureId, filters.municipalityId ?? "all"].join(":"),
      `CSV export requested for ${preview.totalCount} ΓΕΜΗ businesses`,
      {
        activityId: filters.activityId,
        prefectureId: filters.prefectureId,
        municipalityId: filters.municipalityId ?? null,
        activeOnly: filters.activeOnly,
        totalCount: preview.totalCount
      }
    );

    return new Response(gemiAdminCsvStream(filters), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${gemiAdminCsvFilename(filters)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-GEMI-Result-Count": String(preview.totalCount)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export ΓΕΜΗ data";
    const status = /AUTH_REQUIRED|permission/i.test(message) ? 403 : /required|invalid/i.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

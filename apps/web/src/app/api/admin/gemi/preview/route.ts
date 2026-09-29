import { requireAdminSession } from "../../../../../lib/admin-session";
import { gemiAdminPreview, normalizeGemiAdminFilters } from "../../../../../lib/gemi-admin-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "vendor.manage" });
    const url = new URL(request.url);
    const filters = normalizeGemiAdminFilters({
      activityId: url.searchParams.get("activity"),
      prefectureId: url.searchParams.get("prefecture"),
      municipalityId: url.searchParams.get("municipality"),
      activeOnly: url.searchParams.get("activeOnly")
    });
    const preview = await gemiAdminPreview(filters);
    return Response.json({ filters, preview }, {
      status: 200,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not search ΓΕΜΗ";
    const status = /AUTH_REQUIRED|permission/i.test(message) ? 403 : /required|invalid/i.test(message) ? 400 : 502;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

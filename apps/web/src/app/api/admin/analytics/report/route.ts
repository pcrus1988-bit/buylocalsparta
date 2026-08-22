import { getAdminSession } from "../../../../../lib/admin-session";
import {
  adminVendorAnalyticsReport,
  normalizeAdminAnalyticsFilters,
  vendorAnalyticsReportCsv
} from "../../../../../lib/admin-analytics-reporting";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await getAdminSession();
  if (!principal) return Response.json({ error: "Authentication required" }, { status: 401 });

  try {
    const url = new URL(request.url);
    const filters = normalizeAdminAnalyticsFilters({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      vendorId: url.searchParams.get("vendor") ?? undefined,
      categoryCode: url.searchParams.get("category") ?? undefined
    });
    const report = await adminVendorAnalyticsReport(principal, filters);
    const suffix = [filters.vendorId ?? "all-vendors", filters.categoryCode ?? "all-categories", filters.from, filters.to]
      .join("_")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .slice(0, 160);
    return new Response(`\uFEFF${vendorAnalyticsReportCsv(report)}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="buy-local-sparta-vendor-analytics_${suffix}.csv"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "admin.analytics_report_download_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    const message = error instanceof Error ? error.message : "Report could not be generated";
    const status = /permission/i.test(message) ? 403 : /date|days|range/i.test(message) ? 400 : 500;
    return Response.json({ error: status === 500 ? "Report could not be generated" : message }, { status });
  }
}

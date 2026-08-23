import { assertAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { getSeoUnifiedReportWorkspace, seoUnifiedReportCsv } from "../../../../../../lib/seo-unified-report";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  Vary: "Cookie"
} as const;

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  const principal = await getAdminSession();
  if (!principal) return errorResponse("ADMIN_AUTH_REQUIRED", 401);
  try {
    assertAdminPermission(principal, "content.read");
  } catch {
    return errorResponse("ADMIN_PERMISSION_REQUIRED", 403);
  }

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return errorResponse("SEO_REPORT_FORMAT_INVALID", 400);

  try {
    const report = await getSeoUnifiedReportWorkspace(principal);
    const stamp = report.generatedAt.replace(/[:.]/g, "-");
    const filename = `kontamou-seo-live-${stamp}.${format}`;
    if (format === "csv") return new Response(seoUnifiedReportCsv(report), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch {
    return errorResponse("SEO_LIVE_REPORT_EXPORT_FAILED", 500);
  }
}

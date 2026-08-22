import { assertAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { getSeoDiagnosticReport, seoDiagnosticReportCsv } from "../../../../../../lib/seo-diagnostic-reports";

export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  Vary: "Cookie"
} as const;

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request, { params }: Context) {
  const principal = await getAdminSession();
  if (!principal) return errorResponse("ADMIN_AUTH_REQUIRED", 401);
  try {
    assertAdminPermission(principal, "content.read");
  } catch {
    return errorResponse("ADMIN_PERMISSION_REQUIRED", 403);
  }

  const { id } = await params;
  if (!/^seo_report_[a-f0-9]{32}$/.test(id)) return errorResponse("SEO_REPORT_NOT_FOUND", 404);
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return errorResponse("SEO_REPORT_FORMAT_INVALID", 400);

  try {
    const report = await getSeoDiagnosticReport(id);
    if (!report) return errorResponse("SEO_REPORT_NOT_FOUND", 404);
    const filename = `kontamou-seo-${report.id}.${format}`;
    if (format === "csv") {
      return new Response(seoDiagnosticReportCsv(report), {
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`
        }
      });
    }
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch {
    return errorResponse("SEO_REPORT_EXPORT_FAILED", 500);
  }
}

import { buildDeliveryManagerPdfReport, parseDeliveryReportFilters, parseDeliveryReportKind } from "../../../../../lib/delivery-report-runtime";
import { requireDeliveryManagerSession } from "../../../../../lib/delivery-manager-session";

export async function GET(request: Request) {
  try {
    const principal = await requireDeliveryManagerSession(request, false);
    const url = new URL(request.url);
    const filters = parseDeliveryReportFilters(url);
    const kind = parseDeliveryReportKind(url.searchParams.get("kind"));
    const report = await buildDeliveryManagerPdfReport(principal, filters, kind);
    return new Response(new Uint8Array(report.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "delivery_pdf_report_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

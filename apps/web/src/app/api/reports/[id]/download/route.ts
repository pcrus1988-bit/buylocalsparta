import { getVendorSession } from "../../../../../lib/vendor-session";
import { getAdminSession } from "../../../../../lib/admin-session";
import { getReportDownload } from "../../../../../lib/reporting-engine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const vendor = await getVendorSession();
  const admin = vendor ? undefined : await getAdminSession();
  if (!vendor && !admin) return new Response("Authentication required", { status: 401 });
  try {
    const report = vendor ? await getReportDownload("vendor", vendor, id) : await getReportDownload("admin", admin!, id);
    return new Response(new Uint8Array(report.bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(report.filename)}`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report unavailable";
    const status = message.includes("SCOPE") ? 403 : message.includes("NOT_READY") ? 409 : 404;
    return new Response(message, { status, headers: { "cache-control": "private, no-store" } });
  }
}

import { vendorDashboard } from "../../../../lib/vendor-runtime";
import { requireVendorSession } from "../../../../lib/vendor-session";

export async function GET() {
  try {
    return Response.json(await vendorDashboard(await requireVendorSession()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_session_failed" }, { status: 401 });
  }
}

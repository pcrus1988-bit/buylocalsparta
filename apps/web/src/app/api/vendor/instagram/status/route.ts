import { requireVendorSession } from "../../../../../lib/vendor-session";
import { vendorInstagramConnectionStatus } from "../../../../../lib/vendor-instagram-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request);
    return Response.json(await vendorInstagramConnectionStatus(principal), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "instagram_status_failed" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
}

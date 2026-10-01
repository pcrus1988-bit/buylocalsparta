import { requireVendorSession } from "../../../../../lib/vendor-session";
import { disconnectVendorInstagram } from "../../../../../lib/vendor-instagram-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    await disconnectVendorInstagram(principal);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "instagram_disconnect_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

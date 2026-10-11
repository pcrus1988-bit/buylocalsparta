import { requireAdminSession } from "../../../../../../lib/admin-session";
import { reviewHubClaimMedia } from "../../../../../../lib/hub-claim-media-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const body = await request.json() as { id?: string; decision?: string };
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return Response.json({ error: "Invalid review decision" }, { status: 400 });
    }
    await reviewHubClaimMedia(String(body.id ?? ""), body.decision, principal.userId);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Review failed" }, { status: 400 });
  }
}

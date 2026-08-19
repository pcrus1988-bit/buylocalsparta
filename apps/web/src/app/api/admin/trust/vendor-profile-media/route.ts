import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminVendorProfileMediaPublicationAction } from "../../../../../../lib/vendor-profile-media-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as Record<string, unknown>;
    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId.trim() : "";
    const action = String(body.action ?? "") as "publish" | "unpublish";
    if (!assignmentId) throw new Error("Storefront media assignment is required");
    if (!["publish","unpublish"].includes(action)) throw new Error("Unsupported storefront publication action");
    await adminVendorProfileMediaPublicationAction(principal, { assignmentId, action });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "storefront_publication_failed" }, { status: 400 });
  }
}

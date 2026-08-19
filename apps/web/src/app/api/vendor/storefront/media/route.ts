import { requireVendorSession } from "../../../../../lib/vendor-session";
import { archiveVendorProfileMedia, vendorProfileMediaWorkspace } from "../../../../../lib/vendor-profile-media-service";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const assignmentId = typeof body.assignmentId === "string" ? body.assignmentId.trim() : "";
    const action = String(body.action ?? "");
    if (!assignmentId) throw new Error("Storefront media assignment is required");
    if (action !== "archive") throw new Error("Unsupported storefront media action");
    await archiveVendorProfileMedia(principal, assignmentId);
    return Response.json(await vendorProfileMediaWorkspace(principal));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "storefront_media_action_failed" }, { status: 400 });
  }
}

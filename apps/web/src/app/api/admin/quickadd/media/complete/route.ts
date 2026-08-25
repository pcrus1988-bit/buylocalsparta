import { requireAdminSession } from "../../../../../../lib/admin-session";
import { completeAdminQuickAddMedia } from "../../../../../../lib/admin-quickadd-media-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as Record<string, unknown>;
    return Response.json(await completeAdminQuickAddMedia(principal, typeof body.intentId === "string" ? body.intentId : ""));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_quickadd_media_complete_failed" }, { status: 400 });
  }
}

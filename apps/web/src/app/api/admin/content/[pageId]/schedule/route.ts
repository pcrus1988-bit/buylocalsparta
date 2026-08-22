import { requireAdminSession } from "../../../../../../lib/admin-session";
import { adminScheduleContentPage } from "../../../../../../lib/admin-content-editor";

function pageIdFromRequest(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-2) ?? "");
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { scheduledAt?: unknown; reason?: unknown };
    const result = await adminScheduleContentPage(principal, {
      pageId: pageIdFromRequest(request),
      scheduledAt: Number(body.scheduledAt),
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "content_schedule_failed" }, { status: 400 });
  }
}

import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminUpdateContentPage } from "../../../../../lib/admin-content-editor";

function pageIdFromRequest(request: Request): string {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-1) ?? "");
}

export async function PUT(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { pageType?: unknown; reason?: unknown; translations?: unknown };
    if (!Array.isArray(body.translations)) throw new Error("Content translations are required");
    const result = await adminUpdateContentPage(principal, {
      pageId: pageIdFromRequest(request),
      pageType: String(body.pageType ?? "standard") as "home" | "standard" | "landing" | "legal" | "local_landing",
      reason: String(body.reason ?? ""),
      translations: body.translations as Parameters<typeof adminUpdateContentPage>[1]["translations"]
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "content_update_failed" }, { status: 400 });
  }
}

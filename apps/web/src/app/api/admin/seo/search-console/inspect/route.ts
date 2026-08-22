import { requireAdminSession } from "../../../../../../lib/admin-session";
import { inspectSearchConsoleUrl } from "../../../../../../lib/seo-search-console";

export async function POST(request: Request) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { url?: unknown };
    const inspection = await inspectSearchConsoleUrl(String(body.url ?? ""));
    return Response.json({ inspection });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "url_inspection_failed" }, { status: 400 });
  }
}

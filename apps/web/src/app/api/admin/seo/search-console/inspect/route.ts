import { requireAdminSession } from "../../../../../../lib/admin-session";
import { inspectAndPersistSearchConsoleUrl } from "../../../../../../lib/seo-gsc-history";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { url?: unknown };
    const result = await inspectAndPersistSearchConsoleUrl(principal, String(body.url ?? ""));
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "url_inspection_failed" }, { status: 400 });
  }
}

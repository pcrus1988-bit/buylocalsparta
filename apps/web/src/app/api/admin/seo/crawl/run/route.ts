import { requireAdminSession } from "../../../../../../lib/admin-session";
import { runSeoLiveCrawl } from "../../../../../../lib/seo-live-crawl";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { limit?: unknown };
    const report = await runSeoLiveCrawl(principal, Number(body.limit ?? 40));
    return Response.json({ report });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "seo_live_crawl_failed" }, { status: 400 });
  }
}

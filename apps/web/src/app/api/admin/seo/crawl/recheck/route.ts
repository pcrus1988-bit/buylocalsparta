import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { persistSeoLiveCrawl } from "../../../../../../../lib/seo-crawl-history";
import { runSeoTargetedCrawl } from "../../../../../../../lib/seo-live-crawl";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { route?: unknown };
    const report = await runSeoTargetedCrawl(principal, body.route);
    const persistence = await persistSeoLiveCrawl(principal, report);
    if (persistence.available && !persistence.saved) throw new Error(persistence.error ?? "SEO recheck evidence could not be persisted.");
    return Response.json({ report, persistence });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "seo_targeted_recheck_failed" }, { status: 400 });
  }
}

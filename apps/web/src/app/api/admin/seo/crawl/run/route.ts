import { requireAdminSession } from "../../../../../../lib/admin-session";
import { persistSeoLiveCrawl } from "../../../../../../lib/seo-crawl-history";
import { runSeoLiveCrawl } from "../../../../../../lib/seo-live-crawl";
import { persistSeoStructuredDataEvidence } from "../../../../../../lib/seo-structured-data-history";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { limit?: unknown };
    const report = await runSeoLiveCrawl(principal, Number(body.limit ?? 40));
    const persistence = await persistSeoLiveCrawl(principal, report);
    const structuredDataPersistence = await persistSeoStructuredDataEvidence(principal, report, persistence);
    return Response.json({
      report,
      persistence,
      structuredDataPersistence,
      warning: structuredDataPersistence.available && !structuredDataPersistence.saved ? structuredDataPersistence.error : undefined
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "seo_live_crawl_failed" }, { status: 400 });
  }
}
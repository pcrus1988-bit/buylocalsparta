import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { runGovernedSearchConsoleCoverageSample } from "../../../../../../../lib/seo-gsc-index-coverage";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { limit?: unknown };
    const limit = Number(body.limit ?? 10);
    const result = await runGovernedSearchConsoleCoverageSample(principal, limit);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "search_console_index_coverage_failed" }, { status: 400 });
  }
}

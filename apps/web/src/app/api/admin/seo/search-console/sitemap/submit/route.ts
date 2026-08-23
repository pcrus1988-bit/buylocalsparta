import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { submitGovernedSearchConsoleSitemap } from "../../../../../../../lib/seo-gsc-sitemap";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const result = await submitGovernedSearchConsoleSitemap(principal);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "search_console_sitemap_submit_failed" }, { status: 400 });
  }
}

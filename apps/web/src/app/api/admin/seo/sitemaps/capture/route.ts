import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { captureProductionSitemap } from "../../../../../../../lib/seo-sitemap-history";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const result = await captureProductionSitemap(principal);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "seo_sitemap_capture_failed" }, { status: 400 });
  }
}

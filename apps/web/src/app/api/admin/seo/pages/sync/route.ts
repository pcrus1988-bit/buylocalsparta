import { requireAdminSession } from "../../../../../../lib/admin-session";
import { syncSeoUrlRegistry } from "../../../../../../lib/seo-url-registry";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const result = await syncSeoUrlRegistry(principal);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "seo_url_registry_sync_failed" }, { status: 400 });
  }
}

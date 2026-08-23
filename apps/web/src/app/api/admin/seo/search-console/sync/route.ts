import { requireAdminSession } from "../../../../../../lib/admin-session";
import { syncSearchConsoleHistory } from "../../../../../../lib/seo-gsc-history";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const result = await syncSearchConsoleHistory(principal);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "search_console_sync_failed" }, { status: 400 });
  }
}

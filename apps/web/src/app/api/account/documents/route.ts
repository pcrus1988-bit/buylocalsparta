import { requireAccountSession } from "../../../../lib/account-session";
import { listPaintBuildDocuments } from "../../../../lib/paint-build-project-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json({ documents: await listPaintBuildDocuments(principal) }, {
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" }
    });
  } catch {
    return Response.json({ error: "auth_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}

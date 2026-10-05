import { requireAccountSession } from "../../../../../lib/account-session";
import { listSavedCustomerTryOnPreviews } from "../../../../../lib/try-on-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const previews = await listSavedCustomerTryOnPreviews(principal.userId);
    return Response.json({ previews }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_SAVED_FAILED";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

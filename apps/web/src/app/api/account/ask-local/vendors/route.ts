import { requireAccountSession } from "../../../../../lib/account-session";
import { askLocalVendorCandidates } from "../../../../../lib/ask-local-service";

export async function GET(request: Request) {
  try {
    await requireAccountSession();
    const category = new URL(request.url).searchParams.get("category")?.trim() ?? "";
    if (!category) return Response.json({ vendors: [] });
    return Response.json({ vendors: await askLocalVendorCandidates(category) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_candidates_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

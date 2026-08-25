import { requireDailySession } from "../../../../../../lib/daily-session";
import { vendorReopenAskLocalOffer } from "../../../../../../lib/ask-local-lifecycle-service";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) throw new Error("Ask Local request is required.");
    await vendorReopenAskLocalOffer(principal, requestId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ask_local_offer_reopen_failed" }, { status: 400 });
  }
}

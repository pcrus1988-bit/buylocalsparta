import { requireAccountSession } from "../../../../../lib/account-session";
import { customerDecideAskLocalOffer } from "../../../../../lib/ask-local-offer-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
    const action = body.action === "accept" || body.action === "decline" ? body.action : undefined;
    if (!offerId || !action) throw new Error("Offer and decision are required.");
    return Response.json({ requests: await customerDecideAskLocalOffer(principal, { offerId, action }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_offer_decision_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

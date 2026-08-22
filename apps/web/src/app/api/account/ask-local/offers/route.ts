import { requireAccountSession } from "../../../../../lib/account-session";
import { customerDecideAskLocalOffer } from "../../../../../lib/ask-local-offer-service";
import { customerAskLocalRequestViews } from "../../../../../lib/customer-ask-local-view";
import { resolveCustomerPrivateOfferReference } from "../../../../../lib/customer-private-offer-reference";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const requestReference = typeof body.requestReference === "string" ? body.requestReference.trim() : typeof body.offerId === "string" ? body.offerId.trim() : "";
    const action = body.action === "accept" || body.action === "decline" ? body.action : undefined;
    if (!requestReference || !action) throw new Error("Offer and decision are required.");
    const resolved = await resolveCustomerPrivateOfferReference(principal, requestReference, "decision");
    const requests = await customerDecideAskLocalOffer(principal, { offerId: resolved.offerId, action });
    return Response.json({ requests: customerAskLocalRequestViews(requests) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_offer_decision_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

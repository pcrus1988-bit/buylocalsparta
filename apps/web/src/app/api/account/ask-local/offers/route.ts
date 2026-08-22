import { requireAccountSession } from "../../../../../lib/account-session";
import { customerDecideAskLocalOffer } from "../../../../../lib/ask-local-offer-service";
import { customerAskLocalBrowserRequests } from "../../../../../lib/customer-ask-local-browser-view";
import { requireCustomerPrivateOfferInternalId } from "../../../../../lib/customer-private-offer-action-token";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const offerToken = typeof body.actionReference === "string"
      ? body.actionReference.trim()
      : typeof body.offerToken === "string"
        ? body.offerToken.trim()
        : typeof body.offerId === "string"
          ? body.offerId.trim()
          : "";
    const action = body.action === "accept" || body.action === "decline" ? body.action : undefined;
    if (!offerToken || !action) throw new Error("Offer and decision are required.");
    const resolved = await requireCustomerPrivateOfferInternalId(principal, offerToken);
    await customerDecideAskLocalOffer(principal, { offerId: resolved.internalId, action });
    return Response.json({ requests: await customerAskLocalBrowserRequests(principal) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_offer_decision_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

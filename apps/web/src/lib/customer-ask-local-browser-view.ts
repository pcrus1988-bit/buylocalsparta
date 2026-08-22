import type { SessionPrincipal } from "@buy-local-sparta/core";
import { customerPrivateOfferActionToken } from "./customer-private-offer-action-token";
import { customerAskLocalRequests, type AskLocalRequestView } from "./ask-local-service";

function projectRequest(principal: SessionPrincipal, request: AskLocalRequestView): AskLocalRequestView {
  return {
    ...request,
    privateOffers: request.privateOffers.map((offer) => ({
      ...offer,
      id: customerPrivateOfferActionToken(principal.userId, offer.id)
    }))
  };
}

export async function customerAskLocalBrowserRequests(principal: SessionPrincipal): Promise<readonly AskLocalRequestView[]> {
  return (await customerAskLocalRequests(principal)).map((request) => projectRequest(principal, request));
}

export function customerAskLocalBrowserRequest(principal: SessionPrincipal, request: AskLocalRequestView): AskLocalRequestView {
  return projectRequest(principal, request);
}

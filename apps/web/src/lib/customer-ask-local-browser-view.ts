import type { SessionPrincipal } from "@buy-local-sparta/core";
import { customerPrivateOfferActionToken } from "./customer-private-offer-action-token";
import { customerAskLocalRequests, type AskLocalRequestView } from "./ask-local-service";
import type { CustomerAskLocalRequestView } from "./customer-ask-local-view";

function projectRequest(principal: SessionPrincipal, request: AskLocalRequestView): CustomerAskLocalRequestView {
  return {
    ...request,
    privateOffers: request.privateOffers.map(({ id, ...offer }) => ({
      ...offer,
      actionReference: customerPrivateOfferActionToken(principal.userId, id)
    }))
  };
}

export async function customerAskLocalBrowserRequests(principal: SessionPrincipal): Promise<readonly CustomerAskLocalRequestView[]> {
  return (await customerAskLocalRequests(principal)).map((request) => projectRequest(principal, request));
}

export function customerAskLocalBrowserRequest(principal: SessionPrincipal, request: AskLocalRequestView): CustomerAskLocalRequestView {
  return projectRequest(principal, request);
}

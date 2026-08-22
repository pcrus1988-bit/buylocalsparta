import type { SessionPrincipal } from "@buy-local-sparta/core";
import { customerPrivateOfferCheckoutPreview, type CustomerPrivateOfferCheckoutPreview } from "./private-offer-checkout-service";
import { resolveCustomerPrivateOfferReference } from "./customer-private-offer-reference";
import { marketplaceReference } from "./public-reference-service";

export type CustomerPrivateOfferCheckoutView = Readonly<
  Omit<CustomerPrivateOfferCheckoutPreview, "offerId" | "requestId" | "existingOrderId"> & {
    actionReference: string;
    requestReference: string;
    existingOrderReference?: string;
  }
>;

export async function customerPrivateOfferCheckoutView(
  principal: SessionPrincipal,
  identifier: string,
  now = Date.now()
): Promise<CustomerPrivateOfferCheckoutView | undefined> {
  const resolved = await resolveCustomerPrivateOfferReference(principal, identifier, "checkout");
  const preview = await customerPrivateOfferCheckoutPreview(principal, resolved.offerId, now);
  if (!preview) return undefined;
  const existingOrderReference = preview.existingOrderId
    ? await marketplaceReference("order", preview.existingOrderId)
    : undefined;
  const { offerId: _internalOfferId, requestId: _internalRequestId, existingOrderId: _internalOrderId, ...safe } = preview;
  return {
    ...safe,
    actionReference: resolved.requestReference,
    requestReference: resolved.requestReference,
    existingOrderReference
  };
}

import type { AskLocalRequestView } from "./ask-local-service";

type InternalPrivateOffer = AskLocalRequestView["privateOffers"][number];
export type CustomerPrivateOfferView = Readonly<Omit<InternalPrivateOffer, "id"> & { actionReference: string }>;
export type CustomerAskLocalRequestView = Readonly<Omit<AskLocalRequestView, "privateOffers"> & { privateOffers: readonly CustomerPrivateOfferView[] }>;

export function customerAskLocalRequestView(request: AskLocalRequestView): CustomerAskLocalRequestView {
  return {
    ...request,
    privateOffers: request.privateOffers.map(({ id: _internalOfferId, ...offer }) => ({
      ...offer,
      actionReference: request.referenceNumber
    }))
  };
}

export function customerAskLocalRequestViews(requests: readonly AskLocalRequestView[]): readonly CustomerAskLocalRequestView[] {
  return requests.map(customerAskLocalRequestView);
}

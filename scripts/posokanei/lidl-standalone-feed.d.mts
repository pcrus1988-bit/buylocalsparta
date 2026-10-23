export interface GreekLidlStore {
  id:string;name:string;city:string;address:string;postalCode:string;
}
export interface GreekLidlStandaloneOffer {
  id:string;retailer:string;retailerProductIds:string[];
  storeKey:string;name:string;brand:string|null;category:string|null;
  packaging:string|null;unitPriceText:string|null;
  priceEur:number;referencePriceEur:number|null;discountText:string|null;
  validFrom:string;validTo:string;observedAt:string;offerType:string|null;
  redemptionChannel:string|null;validityStatus:"current"|"upcoming";
  membershipRequirement:"verify_with_retailer";
  matchedPosokaneiId:null;basketEligible:false;source:"lidl_plus_public_offers";
}
export function normalizeGreekStores(data:unknown):GreekLidlStore[];
export function normalizeGreekLidlOffers(
  data:unknown,
  options:{storeKey:string;observedAt:string;now?:Date}
):GreekLidlStandaloneOffer[];

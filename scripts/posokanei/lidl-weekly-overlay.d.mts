export interface GovernmentProductIdentity {
  source_product_id:string;name:string;
  brand?:string|null;category?:string|null;
  unit?:string|null;unit_quantity?:number|null;
}
export type LidlMembershipRequirement="requires_lidl_plus"|"no_membership_required";
export interface VerifiedLidlBadge {
  retailerId:"lidl_gr";retailerName:"Lidl";storeKey:string;storeName:string;
  offerPriceEur:number;previousPriceEur:number|null;
  validFrom:string;validTo:string;observedAt:string;offerId:string;
  scope:"specific_store";membershipRequirement:LidlMembershipRequirement;basketEligible:false;
}
export function productIdentityHash(p:GovernmentProductIdentity):string;
export function verifiedLidlBadges(
  snapshot:{products:GovernmentProductIdentity[]},
  artifact:unknown,
  options?:{now?:Date;maxAgeHours?:number}
):Map<string,VerifiedLidlBadge[]>;

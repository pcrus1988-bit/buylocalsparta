/**
 * KONTΑ MOY checkout grant for a hospitality partner without compatible POS.
 * An admin approval is NOT sufficient for production payments: the marketplace
 * checkout has canonical variants and vendor settlement, while DrinkStock has
 * venue-specific prices, table passes and a separate fiscal ledger.
 */
export type CheckoutFallbackAttestations=Readonly<{
 posUnavailable:boolean;
 merchantAuthorizationReviewed:boolean;
 settlementReviewed:boolean;
 fiscalReviewed:boolean;
}>;
export type CheckoutFallbackDecision=Readonly<{
 adminEnabled:boolean;checkoutLive:false;
 status:"disabled"|"approved_pending_adapter";
}>;
export function checkoutFallbackDecision(enabled:boolean):CheckoutFallbackDecision{
 return {adminEnabled:enabled,checkoutLive:false,
  status:enabled?"approved_pending_adapter":"disabled"};
}
export class CheckoutFallbackInputError extends Error{
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type CheckoutFallbackCommand=Readonly<{
 partnerId:string;requestKey:string;enabled:boolean;reason:string;
 reviews:CheckoutFallbackAttestations;
}>;
export function parseCheckoutFallbackCommand(input:unknown):CheckoutFallbackCommand{
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new CheckoutFallbackInputError("INVALID_CHECKOUT_FALLBACK_REQUEST");
 const v=input as Record<string,unknown>;
 if(Object.keys(v).sort().join(",")!=="enabled,fiscalReviewed,merchantAuthorizationReviewed,partnerId,posUnavailable,reason,requestKey,settlementReviewed")
  throw new CheckoutFallbackInputError("INVALID_CHECKOUT_FALLBACK_REQUEST");
 if(typeof v.partnerId!=="string"||!UUID.test(v.partnerId)||
    typeof v.requestKey!=="string"||!UUID.test(v.requestKey))
  throw new CheckoutFallbackInputError("INVALID_CHECKOUT_FALLBACK_ID");
 if(typeof v.enabled!=="boolean")
  throw new CheckoutFallbackInputError("INVALID_CHECKOUT_FALLBACK_STATE");
 const reviews={
  posUnavailable:v.posUnavailable,
  merchantAuthorizationReviewed:v.merchantAuthorizationReviewed,
  settlementReviewed:v.settlementReviewed,
  fiscalReviewed:v.fiscalReviewed
 };
 if(Object.values(reviews).some(x=>typeof x!=="boolean"))
  throw new CheckoutFallbackInputError("INVALID_CHECKOUT_FALLBACK_REVIEWS");
 const reason=typeof v.reason==="string"?v.reason.trim().replace(/\s+/g," "):"";
 if(reason.length<15||reason.length>600)
  throw new CheckoutFallbackInputError("INVALID_CHECKOUT_FALLBACK_REASON");
 if(v.enabled&&!Object.values(reviews).every(Boolean))
  throw new CheckoutFallbackInputError("CHECKOUT_FALLBACK_NOT_ELIGIBLE");
 return {partnerId:v.partnerId,requestKey:v.requestKey,enabled:v.enabled,
  reason,reviews:reviews as CheckoutFallbackAttestations};
}

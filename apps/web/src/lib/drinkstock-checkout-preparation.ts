import {assertQuoteIsLive} from "./drinkstock-commerce-policy";
import {resolveGreekBeverageVat,splitGreekBeverageGross,type BeverageVatClass,
 type GreekVatJurisdiction,type HospitalityServiceMode} from "./drinkstock-greek-vat";
import {type GuestCartLine,type GuestPricePreview,validateGuestCart} from "./drinkstock-guest-quote";

export class CheckoutPreparationError extends Error {
 constructor(public readonly code:string){super(code);}
}
export type TrustedCheckoutDrink = Readonly<{
 id:string;partnerId:string;venueId:string;name:string;
 priceCents:number;vatClass:BeverageVatClass;vatReviewed:boolean;active:boolean;
}>;
export type PreparedCheckoutLine = Readonly<{
 productId:string;description:string;quantity:number;
 unitGrossCents:number;grossCents:number;netCents:number;vatCents:number;
 vatRateBasisPoints:number;vatRuleVersion:string;
}>;
export type PreparedCheckoutIntent = Readonly<{
 partnerId:string;venueId:string;sessionId:string;tablePassId:string;
 quotedAt:string;currency:"EUR";mode:HospitalityServiceMode;
 lines:readonly PreparedCheckoutLine[];
 totalGrossCents:number;totalNetCents:number;totalVatCents:number;
}>;

/**
 * Server-only checkout preparation for the future PSP adapter. All inputs MUST
 * be authenticated server evidence from a locked DB transaction, including the
 * quote snapshot and the verified tax jurisdiction. This pure function does not
 * authenticate a table pass, hold prices, insert an order or accept any payment.
 * In particular, never feed the browser's JSON preview back in as trustedQuote.
 */
export function prepareDrinkStockCheckoutIntent(input:Readonly<{
 partnerId:string;venueId:string;tablePassId:string;
 session:{id:string;state:string};
 trustedQuote:GuestPricePreview;
 cart:readonly GuestCartLine[];
 lockedProducts:readonly TrustedCheckoutDrink[];
 mode:HospitalityServiceMode;
 jurisdiction:GreekVatJurisdiction;islandEligibilityVerified:boolean;
 nowMs:number;
}>):PreparedCheckoutIntent {
 const {partnerId,venueId,tablePassId,session,trustedQuote,lockedProducts,mode,jurisdiction,nowMs}=input;
 if(!partnerId||!venueId||!tablePassId||!session.id)
  throw new CheckoutPreparationError("SCOPE_UNVERIFIED");
 if(!["running","crashing"].includes(session.state))
  throw new CheckoutPreparationError("SESSION_NOT_TRADING");
 const quoteTime=Date.parse(trustedQuote.quotedAt);
 if(trustedQuote.kind!=="price_preview_only"||
    trustedQuote.checkoutEnabled!==false||
    trustedQuote.sessionId!==session.id||trustedQuote.venueId!==venueId||
    trustedQuote.currency!=="EUR"||!assertQuoteIsLive(quoteTime,nowMs)||
    Date.parse(trustedQuote.expiresAt)!==quoteTime+15000)
  throw new CheckoutPreparationError("QUOTE_EXPIRED_OR_MISMATCHED");
 // Reuse the same strict, quantity-bounded validation applied to guest previews.
 const validCart=validateGuestCart({items:input.cart.map(x=>({productId:x.productId,quantity:x.quantity}))});
 if(validCart.length!==trustedQuote.lines.length)
  throw new CheckoutPreparationError("QUOTE_ITEMS_CHANGED");
 const byId=new Map(lockedProducts.map(x=>[x.id.toLowerCase(),x]));
 if(byId.size!==lockedProducts.length)
  throw new CheckoutPreparationError("PRODUCT_EVIDENCE_INVALID");
 const original=new Map(trustedQuote.lines.map(x=>[x.productId.toLowerCase(),x]));
 if(original.size!==trustedQuote.lines.length)
  throw new CheckoutPreparationError("QUOTE_ITEMS_CHANGED");
 let totalGrossCents=0,totalNetCents=0,totalVatCents=0;
 const lines=validCart.map(line=>{
  const p=byId.get(line.productId.toLowerCase()),q=original.get(line.productId.toLowerCase());
  if(!p||!q||!p.active||p.partnerId!==partnerId||p.venueId!==venueId||
    p.id.toLowerCase()!==line.productId.toLowerCase())
   throw new CheckoutPreparationError("PRODUCT_NOT_AUTHORIZED");
  if(!p.vatReviewed||p.vatClass==="review_required")
   throw new CheckoutPreparationError("VAT_REVIEW_REQUIRED");
  if(!Number.isSafeInteger(p.priceCents)||p.priceCents<=0||
     p.priceCents!==q.unitGrossCents||q.quantity!==line.quantity||
     q.lineGrossCents!==line.quantity*p.priceCents||q.description!==p.name)
   throw new CheckoutPreparationError("PRICE_REQUOTE_REQUIRED");
  // The jurisdiction and service mode must be merchant-verified server facts,
  // never submitted or overridden by the guest.
  let rate;
  try{rate=resolveGreekBeverageVat({vatClass:p.vatClass,mode,jurisdiction,
   islandEligibilityVerified:input.islandEligibilityVerified});}
  catch{throw new CheckoutPreparationError("VAT_CONTEXT_UNVERIFIED");}
  const gross=line.quantity*p.priceCents;
  if(!Number.isSafeInteger(gross)||gross<1)
   throw new CheckoutPreparationError("INVALID_GROSS");
  const split=splitGreekBeverageGross(gross,rate.rateBasisPoints);
  totalGrossCents+=split.grossCents;totalNetCents+=split.netCents;totalVatCents+=split.vatCents;
  if(![totalGrossCents,totalNetCents,totalVatCents].every(Number.isSafeInteger))
   throw new CheckoutPreparationError("INVALID_GROSS");
  return {productId:p.id,description:p.name,quantity:line.quantity,unitGrossCents:p.priceCents,
   grossCents:split.grossCents,netCents:split.netCents,vatCents:split.vatCents,
   vatRateBasisPoints:rate.rateBasisPoints,vatRuleVersion:rate.version};
 });
 if(!lines.length||totalGrossCents!==trustedQuote.totalGrossCents||
    totalNetCents+totalVatCents!==totalGrossCents)
  throw new CheckoutPreparationError("QUOTE_TOTAL_MISMATCH");
 return {partnerId,venueId,sessionId:session.id,tablePassId,
  quotedAt:trustedQuote.quotedAt,currency:"EUR",mode,lines,
  totalGrossCents,totalNetCents,totalVatCents};
}

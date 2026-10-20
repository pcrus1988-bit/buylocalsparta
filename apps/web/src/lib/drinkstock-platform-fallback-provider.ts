import {MolliePaymentsClient,mollieConfigFromEnv,mollieEnvironment,type MolliePayment} from "@buy-local-sparta/mollie-payments";
import {molliePaymentsProviderReadiness,molliePaymentsEnabled} from "./mollie-runtime";
import {myDataReadiness} from "./mydata-runtime";
import {accessibleDrinkStockPartners} from "./hospitality-partner-access";
import {checkoutFallbackByPartner} from "./drinkstock-checkout-fallback-service";

export class PlatformFallbackError extends Error {
 constructor(public readonly code:string,public readonly status=409){super(code);}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DRINKSTOCK_FALLBACK_PROVIDER_MODE="kontamou_existing_mollie_and_aade" as const;
export const PLATFORM_PAYMENT_RELEASED=false as const;
export type PlatformMollieIntent=Readonly<{
 partnerId:string;venueId:string;orderId:string;requestKey:string;
 grossCents:number;redirectUrl:string;webhookUrl:string;
}>;
export function platformMollieIntent(input:PlatformMollieIntent){
 for(const id of [input.partnerId,input.venueId,input.orderId,input.requestKey]){
  if(!UUID.test(id))throw new PlatformFallbackError("INVALID_ORDER_SCOPE",400);
 }
 if(!Number.isSafeInteger(input.grossCents)||input.grossCents<50||input.grossCents>400000)
  throw new PlatformFallbackError("INVALID_GROSS_CENTS",400);
 for(const raw of [input.redirectUrl,input.webhookUrl]){
  let url:URL;try{url=new URL(raw);}catch{throw new PlatformFallbackError("INVALID_RETURN_URL",400);}
  if(url.protocol!=="https:"||url.hostname!=="hospitality.kontamou.site"||
   url.port||url.username||url.password||url.hash)
   throw new PlatformFallbackError("INVALID_RETURN_URL",400);
 }
 return {amountMinor:input.grossCents,orderId:input.orderId,
  orderNumber:"DS-"+input.orderId.slice(0,8),description:"DrinkStock order "+input.orderId.slice(0,8),
  redirectUrl:input.redirectUrl,webhookUrl:input.webhookUrl,
  metadata:{source:"drinkstock",providerMode:DRINKSTOCK_FALLBACK_PROVIDER_MODE,
   partnerId:input.partnerId,venueId:input.venueId,
   requestKey:input.requestKey}};
}
/** Payment proofs must come from Mollie's API, never the QR browser or webhook request body. */
export function verifyPlatformMolliePayment(payment:MolliePayment,evidence:Readonly<{
 paymentId:string;orderId:string;partnerId:string;venueId:string;grossCents:number
}>){
 const m=payment.metadata??{};
 if(payment.paymentId!==evidence.paymentId||payment.status!=="paid"||
    payment.amountCurrency!=="EUR"||payment.amountMinor!==evidence.grossCents||
    payment.orderId!==evidence.orderId||
    m.source!=="drinkstock"||m.providerMode!==DRINKSTOCK_FALLBACK_PROVIDER_MODE||
    m.partnerId!==evidence.partnerId||m.venueId!==evidence.venueId)
  throw new PlatformFallbackError("PLATFORM_MOLLIE_PAYMENT_MISMATCH",409);
 return {verified:true as const,orderId:evidence.orderId,paymentId:payment.paymentId,
  partnerId:evidence.partnerId,venueId:evidence.venueId,amountCents:payment.amountMinor};
}
/** Shared provider adapters, NEVER partner-created Mollie/AADE credentials. */
export async function platformFallbackDiagnostics(userId:string,partnerId:string){
 if(!UUID.test(partnerId)||!userId)throw new PlatformFallbackError("NOT_FOUND",404);
 const partners=await accessibleDrinkStockPartners(userId);
 const membership=partners.find(p=>p.partnerId===partnerId&&["owner","manager"].includes(p.role));
 if(!membership)throw new PlatformFallbackError("NOT_FOUND",404);
 const approved=await checkoutFallbackByPartner(partnerId);
 const [mollie,aade]=await Promise.allSettled([
  molliePaymentsProviderReadiness(),myDataReadiness()
 ]);
 const psp=mollie.status==="fulfilled"?mollie.value:undefined;
 const fiscal=aade.status==="fulfilled"?aade.value:undefined;
 return {
  providerMode:DRINKSTOCK_FALLBACK_PROVIDER_MODE,
  partnerId,partnerName:membership.partnerName,adminApproved:approved.adminEnabled,
  mollie:{account:"KONTA MOY",configured:molliePaymentsEnabled(),
   liveReady:psp?.enabled===true&&psp.ready===true&&psp.environment==="live"},
  aade:{account:"KONTA MOY",configured:fiscal?.configured===true,
   directErpReady:fiscal?.ready===true&&fiscal.environment==="production",
   retailReceiptIssuerVerified:false as const},
  sellerOfRecord:"needs_explicit_legal_verification" as const,
  partnerProviderSetupRequired:false as const,
  guestPaymentsEnabled:false as const,
  remaining:[
    "Verify contract and legal seller/issuer for each hospitality venue",
    "Build venue-scoped atomic payment/order and provider-verified webhook adapter",
    "Certify retail receipt issuance and credit/refund reconciliation"
  ]
 };
}
/** Prepared shared-account payment creation. Not callable via a public route.
 * Hard release gate remains CLOSED until the legal-seller, certified receipt,
 * refund, idempotency and transaction proof paths actually ship.
 */
export async function createPlatformDrinkStockMolliePayment(input:PlatformMollieIntent){
 const intent=platformMollieIntent(input);
 if(PLATFORM_PAYMENT_RELEASED!==true)
  throw new PlatformFallbackError("DRINKSTOCK_PLATFORM_FISCAL_CHECKOUT_NOT_RELEASED",409);
 if(process.env.DRINKSTOCK_PLATFORM_FALLBACK_ENABLED!=="true")
  throw new PlatformFallbackError("DRINKSTOCK_PLATFORM_FALLBACK_DISABLED",409);
 if(!molliePaymentsEnabled())throw new PlatformFallbackError("MOLLIE_NOT_ENABLED",503);
 const config=mollieConfigFromEnv();
 if(mollieEnvironment(config)!=="live")
  throw new PlatformFallbackError("LIVE_MOLLIE_REQUIRED",503);
 return new MolliePaymentsClient(config).createPayment(intent);
}
/** Server-to-server lookup on the EXISTING KONTA MOY Mollie credentials.
 * This function performs no mutation, and is not a webhook endpoint.
 */
export async function retrieveVerifiedPlatformMolliePayment(paymentId:string,evidence:{
 orderId:string;partnerId:string;venueId:string;grossCents:number
}){
 if(!/^tr_[A-Za-z0-9]+$/.test(paymentId))throw new PlatformFallbackError("INVALID_PAYMENT_ID",400);
 if(!molliePaymentsEnabled())throw new PlatformFallbackError("MOLLIE_NOT_ENABLED",503);
 const config=mollieConfigFromEnv();
 if(mollieEnvironment(config)!=="live")throw new PlatformFallbackError("LIVE_MOLLIE_REQUIRED",503);
 const payment=await new MolliePaymentsClient(config).retrievePayment(paymentId);
 return verifyPlatformMolliePayment(payment,{...evidence,paymentId});
}

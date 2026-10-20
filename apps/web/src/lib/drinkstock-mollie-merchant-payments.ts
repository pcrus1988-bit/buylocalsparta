/**
 * Venue-owned Mollie Payments API transport.
 *
 * The platform's marketplace Mollie key MUST NOT be passed to this transport.
 * Only a connected merchant OAuth access token is allowed.
 * These methods are intentionally not mounted on any public checkout route:
 * the certified retail-receipt and atomic commercial order adapters have not
 * been approved for production. They provide the concrete PSP protocol layer.
 */
import {MerchantConnectionError} from "./drinkstock-merchant-connections";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderSizeLimit=400000;
export type MerchantMolliePaymentInput=Readonly<{
 orderId:string;requestKey:string;merchantProfileId:string;grossCents:number;
 redirectUrl:string;webhookUrl:string;
}>;
export type MerchantMolliePaymentResponse=Readonly<{
 id:string;status:string;mode:string;profileId:string;
 amount:{currency:string;value:string};
 metadata?:{drinkstockOrderId?:string};_links?:{checkout?:{href?:string}};
}>;
export function merchantPaymentPayload(input:MerchantMolliePaymentInput){
 if(!uuid.test(input.orderId)||!uuid.test(input.requestKey)||!/^pfl_[A-Za-z0-9]+$/.test(input.merchantProfileId)||
    !Number.isSafeInteger(input.grossCents)||input.grossCents<50||input.grossCents>orderSizeLimit)
  throw new MerchantConnectionError("INVALID_MERCHANT_PAYMENT_INTENT");
 for(const raw of [input.redirectUrl,input.webhookUrl]){
  let u:URL;try{u=new URL(raw);}catch{throw new MerchantConnectionError("INVALID_PAYMENT_RETURN_URL");}
  if(u.protocol!=="https:"||u.hostname!=="hospitality.kontamou.site"||u.port||u.username||u.password||u.hash)
   throw new MerchantConnectionError("INVALID_PAYMENT_RETURN_URL");
 }
 return {amount:{currency:"EUR" as const,value:(input.grossCents/100).toFixed(2)},
  description:"DrinkStock "+input.orderId.slice(0,8),
  redirectUrl:input.redirectUrl,webhookUrl:input.webhookUrl,profileId:input.merchantProfileId,
  metadata:{drinkstockOrderId:input.orderId}};
}
export function validatePaidMerchantMolliePayment(payment:MerchantMolliePaymentResponse,evidence:{
 paymentId:string;orderId:string;profileId:string;grossCents:number
}){
 if(!/^tr_[A-Za-z0-9]+$/.test(evidence.paymentId)||payment.id!==evidence.paymentId||
    payment.status!=="paid"||payment.mode!=="live"||payment.profileId!==evidence.profileId||
    payment.metadata?.drinkstockOrderId!==evidence.orderId||payment.amount.currency!=="EUR"||
    !/^\d+\.\d{2}$/.test(payment.amount.value)||
    Number(payment.amount.value.replace(".",""))!==evidence.grossCents)
  throw new MerchantConnectionError("MOLLIE_PAYMENT_NOT_VERIFIED",409);
 return {verified:true as const,paymentId:payment.id,orderId:evidence.orderId,grossCents:evidence.grossCents};
}
export async function createMerchantMolliePayment(
 input:MerchantMolliePaymentInput,merchantOAuthAccessToken:string,
 options:{receiptIssuerCertified:boolean;commercialOrderPersisted:boolean;releasedForProduction:boolean},
 fetcher:typeof fetch=fetch
):Promise<{paymentId:string;checkoutUrl:string}>{
 // These are trusted, server-owned release attestations, never guest JSON.
 if(!options.receiptIssuerCertified||!options.commercialOrderPersisted||!options.releasedForProduction||
    process.env.DRINKSTOCK_COMMERCIAL_PAYMENTS_ENABLED!=="true")
  throw new MerchantConnectionError("DRINKSTOCK_CHECKOUT_NOT_CERTIFIED",409);
 if(typeof merchantOAuthAccessToken!=="string"||!merchantOAuthAccessToken.startsWith("access_"))
  throw new MerchantConnectionError("INVALID_MERCHANT_OAUTH_ACCESS",503);
 const payload=merchantPaymentPayload(input);let r:Response;
 try{r=await fetcher("https://api.mollie.com/v2/payments",{method:"POST",signal:AbortSignal.timeout(12000),
  headers:{authorization:"Bearer "+merchantOAuthAccessToken,accept:"application/json",
   "content-type":"application/json","Idempotency-Key":input.requestKey},
  body:JSON.stringify(payload)});}catch{throw new MerchantConnectionError("MOLLIE_CREATE_UNAVAILABLE",503);}
 if(!r.ok)throw new MerchantConnectionError("MOLLIE_CREATE_REJECTED",502);
 const payment=await r.json() as MerchantMolliePaymentResponse;
 const url=payment._links?.checkout?.href;
 if(!/^tr_[A-Za-z0-9]+$/.test(payment.id)||payment.profileId!==input.merchantProfileId||
    payment.amount?.currency!=="EUR"||payment.amount.value!==payload.amount.value||
    payment.metadata?.drinkstockOrderId!==input.orderId||typeof url!=="string")
  throw new MerchantConnectionError("MOLLIE_CREATE_RESPONSE_INVALID",502);
 let parsed:URL;try{parsed=new URL(url);}catch{throw new MerchantConnectionError("MOLLIE_CHECKOUT_URL_INVALID",502);}
 if(parsed.protocol!=="https:"||!parsed.hostname.endsWith(".mollie.com")||parsed.username||parsed.password)
  throw new MerchantConnectionError("MOLLIE_CHECKOUT_URL_INVALID",502);
 return {paymentId:payment.id,checkoutUrl:url};
}
export async function retrieveMerchantMolliePayment(
 paymentId:string,merchantOAuthAccessToken:string,fetcher:typeof fetch=fetch
):Promise<MerchantMolliePaymentResponse>{
 if(!/^tr_[A-Za-z0-9]+$/.test(paymentId)||!merchantOAuthAccessToken.startsWith("access_"))
  throw new MerchantConnectionError("INVALID_MOLLIE_PROVIDER_REFERENCE");
 let r:Response;
 try{r=await fetcher("https://api.mollie.com/v2/payments/"+paymentId,{method:"GET",
  signal:AbortSignal.timeout(12000),headers:{authorization:"Bearer "+merchantOAuthAccessToken,accept:"application/json"}});}
 catch{throw new MerchantConnectionError("MOLLIE_STATUS_UNAVAILABLE",503);}
 if(!r.ok)throw new MerchantConnectionError("MOLLIE_STATUS_UNAVAILABLE",502);
 const payment=await r.json() as MerchantMolliePaymentResponse;
 if(payment.id!==paymentId)throw new MerchantConnectionError("MOLLIE_PAYMENT_ID_MISMATCH",502);
 return payment;
}

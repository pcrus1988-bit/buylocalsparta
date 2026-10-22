import {MerchantConnectionError} from "./drinkstock-merchant-connection-error";
import {retrieveMerchantMolliePayment,validatePaidMerchantMolliePayment} from "./drinkstock-mollie-merchant-payments";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PID=/^tr_[A-Za-z0-9]{1,100}$/;
const RID=/^re_[A-Za-z0-9]{1,100}$/;
export type MerchantRefundIntent=Readonly<{
 orderId:string;requestKey:string;paymentId:string;profileId:string;
 paidGrossCents:number;refundGrossCents:number;
}>;
export type MerchantRefundResponse=Readonly<{
 id:string;paymentId:string;status:string;
 amount:{currency:string;value:string};
 metadata?:{drinkstockOrderId?:string;drinkstockRefundRequestKey?:string};
}>;
function validateIntent(x:MerchantRefundIntent){
 if(!UUID.test(x.orderId)||!UUID.test(x.requestKey)||!PID.test(x.paymentId)||
    !/^pfl_[A-Za-z0-9]+$/.test(x.profileId)||
    !Number.isSafeInteger(x.paidGrossCents)||x.paidGrossCents<1||x.paidGrossCents>400000||
    !Number.isSafeInteger(x.refundGrossCents)||x.refundGrossCents<1||x.refundGrossCents>x.paidGrossCents)
  throw new MerchantConnectionError("INVALID_MERCHANT_REFUND_INTENT");
}
function auth(token:string){
 if(typeof token!=="string"||!/^access_[A-Za-z0-9._~-]+$/.test(token))
  throw new MerchantConnectionError("INVALID_MERCHANT_OAUTH_ACCESS",503);
 return {authorization:"Bearer "+token,accept:"application/json"};
}
export function merchantRefundPayload(x:MerchantRefundIntent){
 validateIntent(x);
 return {amount:{currency:"EUR",value:(x.refundGrossCents/100).toFixed(2)},
  description:"DrinkStock refund "+x.orderId.slice(0,8),
  metadata:{drinkstockOrderId:x.orderId,drinkstockRefundRequestKey:x.requestKey}};
}
/** A queued/processing refund is NOT money returned and is NOT a credit note. */
export function validateMerchantMollieRefund(p:MerchantRefundResponse,x:MerchantRefundIntent,refundId?:string){
 validateIntent(x);
 if(!p||!RID.test(p.id)||refundId!==undefined&&p.id!==refundId||p.paymentId!==x.paymentId||
    p.amount?.currency!=="EUR"||p.amount.value!==(x.refundGrossCents/100).toFixed(2)||
    p.metadata?.drinkstockOrderId!==x.orderId||p.metadata?.drinkstockRefundRequestKey!==x.requestKey||
    !["queued","pending","processing","refunded","failed","canceled"].includes(p.status))
  throw new MerchantConnectionError("MOLLIE_REFUND_NOT_VERIFIED",409);
 return {refundId:p.id,paymentId:p.paymentId,status:p.status,
  refunded:p.status==="refunded",failed:["failed","canceled"].includes(p.status),
  refundGrossCents:x.refundGrossCents};
}
async function fetchRefund(url:string,token:string,init:RequestInit,fetcher:typeof fetch){
 let r:Response;
 try{r=await fetcher(url,{...init,signal:AbortSignal.timeout(12000),
  headers:{...auth(token),...init.headers}});}
 catch(e){if(e instanceof MerchantConnectionError)throw e;
  throw new MerchantConnectionError("MOLLIE_REFUND_OUTCOME_UNKNOWN",503);}
 // A timeout/5xx/invalid response must be reconciled with the SAME persisted
 // idempotency key. Never infer "no refund" or generate a fresh key on retry.
 if(!r.ok)throw new MerchantConnectionError(r.status>=500?
  "MOLLIE_REFUND_OUTCOME_UNKNOWN":"MOLLIE_REFUND_REJECTED",r.status>=500?503:502);
 try{return await r.json() as MerchantRefundResponse;}
 catch{throw new MerchantConnectionError("MOLLIE_REFUND_OUTCOME_UNKNOWN",503);}
}
/** Internal transport only. The caller must durably reserve the refund amount
 * and idempotency key under the order lock BEFORE calling; this transport does
 * not change order/fiscal state or authorize a refund from browser input.
 * A verified parent payment proves live mode and merchant-profile ownership.
 */
export async function createMerchantMollieRefund(
 x:MerchantRefundIntent,token:string,fetcher:typeof fetch=fetch
){
 const payload=merchantRefundPayload(x);auth(token);
 const payment=await retrieveMerchantMolliePayment(x.paymentId,token,fetcher);
 validatePaidMerchantMolliePayment(payment,{
  paymentId:x.paymentId,orderId:x.orderId,profileId:x.profileId,grossCents:x.paidGrossCents
 });
 const refund=await fetchRefund("https://api.mollie.com/v2/payments/"+x.paymentId+"/refunds",token,{
  method:"POST",headers:{"content-type":"application/json","Idempotency-Key":x.requestKey},
  body:JSON.stringify(payload)
 },fetcher);
 return validateMerchantMollieRefund(refund,x);
}
/** Retrieve on the merchant OAuth account; never trust a webhook refund status. */
export async function retrieveMerchantMollieRefund(
 x:MerchantRefundIntent,refundId:string,token:string,fetcher:typeof fetch=fetch
){
 validateIntent(x);auth(token);
 if(!RID.test(refundId))throw new MerchantConnectionError("INVALID_MOLLIE_REFUND_REFERENCE");
 const payment=await retrieveMerchantMolliePayment(x.paymentId,token,fetcher);
 validatePaidMerchantMolliePayment(payment,{
  paymentId:x.paymentId,orderId:x.orderId,profileId:x.profileId,grossCents:x.paidGrossCents
 });
 const refund=await fetchRefund("https://api.mollie.com/v2/payments/"+x.paymentId+"/refunds/"+refundId,
  token,{method:"GET"},fetcher);
 return validateMerchantMollieRefund(refund,x,refundId);
}

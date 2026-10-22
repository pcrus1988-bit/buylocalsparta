import test from "node:test";
import assert from "node:assert/strict";
import {createMerchantMollieRefund,retrieveMerchantMollieRefund,merchantRefundPayload,validateMerchantMollieRefund} from "../src/lib/drinkstock-mollie-refunds.ts";
const intent={orderId:"11111111-1111-4111-8111-111111111111",requestKey:"22222222-2222-4222-8222-222222222222",
 paymentId:"tr_ABC123",profileId:"pfl_Merchant123",paidGrossCents:587,refundGrossCents:32};
const paid={id:intent.paymentId,mode:"live",status:"paid",profileId:intent.profileId,
 amount:{currency:"EUR",value:"5.87"},metadata:{drinkstockOrderId:intent.orderId}};
const refund={id:"re_ABC123",paymentId:intent.paymentId,status:"queued",amount:{currency:"EUR",value:"0.32"},
 metadata:{drinkstockOrderId:intent.orderId,drinkstockRefundRequestKey:intent.requestKey}};
test("refunds preserve cent precision and queued status is not treated as returned funds",()=>{
 assert.equal(merchantRefundPayload(intent).amount.value,"0.32");
 assert.equal(validateMerchantMollieRefund(refund,intent).refunded,false);
 assert.equal(validateMerchantMollieRefund({...refund,status:"refunded"},intent).refunded,true);
 for(const status of ["failed","canceled"])assert.equal(validateMerchantMollieRefund({...refund,status},intent).failed,true);
});
test("cross-order, wrong amount, unknown state, mismatched provider ID and malformed responses fail",()=>{
 for(const x of [{...refund,paymentId:"tr_Other"},{...refund,metadata:{}},
  {...refund,amount:{currency:"USD",value:"0.32"}},{...refund,amount:{currency:"EUR",value:"0.33"}},
  {...refund,status:"complete"},{...refund,id:"bad"},null])
  assert.throws(()=>validateMerchantMollieRefund(x as typeof refund,intent),/MOLLIE_REFUND_NOT_VERIFIED/);
 assert.throws(()=>merchantRefundPayload({...intent,refundGrossCents:588}),/INVALID_MERCHANT_REFUND_INTENT/);
});
test("creation fetches the merchant payment before POST and uses the durable key",async()=>{
 const seen:{url:string;init?:RequestInit}[]=[];
 const fetcher=(async(url:unknown,init?:RequestInit)=>{seen.push({url:String(url),init});
  return Response.json(seen.length===1?paid:refund);}) as typeof fetch;
 const x=await createMerchantMollieRefund(intent,"access_MerchantToken",fetcher);
 assert.equal(x.refunded,false);assert.equal(seen.length,2);
 assert.equal(seen[0].url,"https://api.mollie.com/v2/payments/tr_ABC123");
 assert.equal(seen[1].url,seen[0].url+"/refunds");
 assert.equal(new Headers(seen[1].init?.headers).get("Idempotency-Key"),intent.requestKey);
 assert.equal(new Headers(seen[1].init?.headers).get("authorization"),"Bearer access_MerchantToken");
});
test("test-mode or foreign-merchant payment never initiates a refund",async()=>{
 for(const wrong of [{...paid,mode:"test"},{...paid,profileId:"pfl_Other"},{...paid,status:"open"}]){
  let calls=0;const fetcher=(async()=>{calls++;return Response.json(wrong);}) as typeof fetch;
  await assert.rejects(()=>createMerchantMollieRefund(intent,"access_MerchantToken",fetcher),/MOLLIE_PAYMENT_NOT_VERIFIED/);
  assert.equal(calls,1);
 }
});
test("timeouts and server errors are uncertain outcomes, not permission to retry with a new key",async()=>{
 for(const timeout of [false,true]){
  let calls=0;const fetcher=(async()=>{if(++calls===1)return Response.json(paid);
   if(timeout)throw new Error("timeout");return new Response("unavailable",{status:503});}) as typeof fetch;
  await assert.rejects(()=>createMerchantMollieRefund(intent,"access_MerchantToken",fetcher),/MOLLIE_REFUND_OUTCOME_UNKNOWN/);
 }
});
test("reconciliation fetches the exact refund resource and requires the expected ID",async()=>{
 const urls:string[]=[];const fetcher=(async(url:unknown)=>{urls.push(String(url));
  return Response.json(urls.length===1?paid:{...refund,status:"refunded"});}) as typeof fetch;
 assert.equal((await retrieveMerchantMollieRefund(intent,refund.id,"access_MerchantToken",fetcher)).refunded,true);
 assert.equal(urls[1],"https://api.mollie.com/v2/payments/tr_ABC123/refunds/re_ABC123");
 const wrong=(async(url:unknown)=>Response.json(String(url).endsWith("re_ABC123")?
  {...refund,id:"re_Other"}:paid)) as typeof fetch;
 await assert.rejects(()=>retrieveMerchantMollieRefund(intent,refund.id,"access_MerchantToken",wrong),/MOLLIE_REFUND_NOT_VERIFIED/);
});

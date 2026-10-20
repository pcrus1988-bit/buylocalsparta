import test from "node:test";
import assert from "node:assert/strict";
import {merchantPaymentPayload,validatePaidMerchantMolliePayment,createMerchantMolliePayment,
 retrieveMerchantMolliePayment} from "../src/lib/drinkstock-mollie-merchant-payments.ts";
import {MerchantConnectionError} from "../src/lib/drinkstock-merchant-connections.ts";
const orderId="11111111-1111-4111-8111-111111111111",requestKey="22222222-2222-4222-8222-222222222222";
const base={orderId,requestKey,merchantProfileId:"pfl_Merchant123",grossCents:587,
 redirectUrl:"https://hospitality.kontamou.site/drinkStock/checkout/return",
 webhookUrl:"https://hospitality.kontamou.site/api/hospitality/mollie/payment-webhook"};
test("merchant-owned payment payload preserves 1-cent precision and strict callback origins",()=>{
 assert.deepEqual(merchantPaymentPayload(base).amount,{currency:"EUR",value:"5.87"});
 assert.equal(merchantPaymentPayload(base).metadata.drinkstockOrderId,orderId);
 assert.throws(()=>merchantPaymentPayload({...base,merchantProfileId:"merchant_shared"}),MerchantConnectionError);
 assert.throws(()=>merchantPaymentPayload({...base,redirectUrl:"https://evil.example/pay"}),MerchantConnectionError);
 assert.throws(()=>merchantPaymentPayload({...base,grossCents:NaN}),MerchantConnectionError);
});
test("provider-fetched paid evidence matches order, profile, gross EUR cents and LIVE mode",()=>{
 const evidence={paymentId:"tr_ABC123",orderId,profileId:base.merchantProfileId,grossCents:587};
 const p={id:evidence.paymentId,status:"paid",mode:"live",profileId:evidence.profileId,
  amount:{currency:"EUR",value:"5.87"},metadata:{drinkstockOrderId:orderId}};
 assert.equal(validatePaidMerchantMolliePayment(p,evidence).verified,true);
 for(const wrong of [{...p,status:"open"},{...p,mode:"test"},
  {...p,profileId:"pfl_other"},{...p,amount:{currency:"EUR",value:"5.88"}},
  {...p,metadata:{drinkstockOrderId:requestKey}}])
  assert.throws(()=>validatePaidMerchantMolliePayment(wrong,evidence),MerchantConnectionError);
});
test("payment creation rejects before any external request when fiscal or ledger release is missing",async()=>{
 let called=0;const fetcher=(async()=>{called++;throw new Error("should not request payments");}) as typeof fetch;
 await assert.rejects(()=>createMerchantMolliePayment(base,"access_TestKey",
  {receiptIssuerCertified:false,commercialOrderPersisted:true,releasedForProduction:true},fetcher),
  /DRINKSTOCK_CHECKOUT_NOT_CERTIFIED/);
 assert.equal(called,0);
});
test("provider status is always fetched, never inferred from callback body",async()=>{
 let seen="";
 const fetcher=(async(url:string|URL|Request)=>{seen=String(url);
  return new Response(JSON.stringify({id:"tr_ABC123",status:"open",mode:"live",
   profileId:base.merchantProfileId,amount:{currency:"EUR",value:"5.87"}}),{status:200});
 }) as typeof fetch;
 const paid=await retrieveMerchantMolliePayment("tr_ABC123","access_TestKey",fetcher);
 assert.equal(paid.status,"open");
 assert.equal(seen,"https://api.mollie.com/v2/payments/tr_ABC123");
});

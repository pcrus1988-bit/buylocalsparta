import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createPlatformDrinkStockMolliePayment,platformMollieIntent,
 verifyPlatformMolliePayment,DRINKSTOCK_FALLBACK_PROVIDER_MODE,
 PLATFORM_PAYMENT_RELEASED,PlatformFallbackError} from "../src/lib/drinkstock-platform-fallback-provider.ts";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const payload={
 partnerId:"11111111-1111-4111-8111-111111111111",
 venueId:"22222222-2222-4222-8222-222222222222",
 orderId:"33333333-3333-4333-8333-333333333333",
 requestKey:"44444444-4444-4444-8444-444444444444",
 grossCents:587,
 redirectUrl:"https://hospitality.kontamou.site/drinkStock/table/return",
 webhookUrl:"https://hospitality.kontamou.site/api/hospitality/public/mollie/webhook"
};
test("Shared fallback uses KONTA MOY existing Mollie and AADE rather than venue OAuth",()=>{
 assert.equal(DRINKSTOCK_FALLBACK_PROVIDER_MODE,"kontamou_existing_mollie_and_aade");
 const backend=read("../src/lib/drinkstock-platform-fallback-provider.ts");
 assert.match(backend,/molliePaymentsProviderReadiness/);
 assert.match(backend,/myDataReadiness/);
 assert.match(backend,/mollieConfigFromEnv\(\)/);
 assert.match(backend,/MolliePaymentsClient\(config\)/);
 assert.doesNotMatch(backend,/merchantMollieServerToken|connectMerchantAade|MOLLIE_CONNECT_CLIENT_SECRET/);
});
test("Shared Mollie intent locks integer cents and order-to-venue attribution",()=>{
 const i=platformMollieIntent(payload);
 assert.equal(i.amountMinor,587);
 assert.deepEqual(i.metadata,{
  source:"drinkstock",providerMode:DRINKSTOCK_FALLBACK_PROVIDER_MODE,
  partnerId:payload.partnerId,venueId:payload.venueId,requestKey:payload.requestKey
 });
 for(const bad of [
  {...payload,grossCents:587.1},{...payload,grossCents:0},
  {...payload,partnerId:"other"},{...payload,redirectUrl:"http://hospitality.kontamou.site"},
  {...payload,webhookUrl:"https://other.example/"}
 ]) assert.throws(()=>platformMollieIntent(bad),PlatformFallbackError);
});
test("Provider-verified paid evidence demands exact platform order/venue/amount",()=>{
 const p={
  paymentId:"tr_123456",status:"paid" as const,amountMinor:587,amountCurrency:"EUR",
  amountRefundedMinor:0,description:"DrinkStock",orderId:payload.orderId,
  metadata:{source:"drinkstock",providerMode:DRINKSTOCK_FALLBACK_PROVIDER_MODE,
   partnerId:payload.partnerId,venueId:payload.venueId}
 };
 const e={paymentId:p.paymentId,orderId:payload.orderId,partnerId:payload.partnerId,
  venueId:payload.venueId,grossCents:587};
 assert.equal(verifyPlatformMolliePayment(p,e).verified,true);
 for(const changed of [
  {...p,status:"pending" as const},{...p,amountMinor:588},
  {...p,amountCurrency:"USD"},{...p,amountRefundedMinor:1},{...p,orderId:payload.requestKey},
  {...p,metadata:{...p.metadata,partnerId:payload.venueId}},
  {...p,metadata:{...p.metadata,venueId:payload.partnerId}}
 ]) assert.throws(()=>verifyPlatformMolliePayment(changed,e),PlatformFallbackError);
});
test("No guest orders can charge KONTA MOY via provider while fiscal adapter remains unverified",async()=>{
 assert.equal(PLATFORM_PAYMENT_RELEASED,false);
 await assert.rejects(()=>createPlatformDrinkStockMolliePayment(payload),
  /DRINKSTOCK_PLATFORM_FISCAL_CHECKOUT_NOT_RELEASED/);
 const shared=read("../src/app/hospitality/drinkStock/dashboard/[partnerId]/payments/page.tsx");
 assert.match(shared,/platformFallbackDiagnostics/);
 assert.doesNotMatch(shared,/DrinkStockAadeConnectForm|merchantConnectionsStatus/);
 for(const route of [
  "../src/app/api/hospitality/partners/[partnerId]/mollie/connect/route.ts",
  "../src/app/api/hospitality/partners/[partnerId]/aade/connect/route.ts",
  "../src/app/api/hospitality/mollie/callback/route.ts"
 ]) assert.match(read(route),/PARTNER_PROVIDER_CONNECTION_NOT_USED_FOR_FALLBACK/);
});

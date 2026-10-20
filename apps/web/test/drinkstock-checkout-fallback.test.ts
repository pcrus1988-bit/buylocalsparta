import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 checkoutFallbackDecision,parseCheckoutFallbackCommand
} from "../src/lib/drinkstock-checkout-fallback-policy.ts";
const good={
 partnerId:"cb5383ae-823d-4fc1-9dc0-875f7d89dd03",
 requestKey:"dbd02180-858b-4bf4-96d5-3e1aaaf74a89",
 enabled:true,
 posUnavailable:true,merchantAuthorizationReviewed:true,
 settlementReviewed:true,fiscalReviewed:true,
 reason:"Venue has no compatible POS. Merchant, fiscal and payout responsibilities reviewed."
};
const source=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");
test("admin entitlement never means checkout payment is activated",()=>{
 assert.deepEqual(checkoutFallbackDecision(false),{adminEnabled:false,checkoutLive:false,status:"disabled"});
 assert.deepEqual(checkoutFallbackDecision(true),{adminEnabled:true,checkoutLive:false,status:"approved_pending_adapter"});
});
test("strict admin input requires explicit eligible POS-absence and financial reviews",()=>{
 const parsed=parseCheckoutFallbackCommand(good);
 assert.equal(parsed.partnerId,good.partnerId);
 assert.deepEqual(parsed.reviews,{
  posUnavailable:true,merchantAuthorizationReviewed:true,
  settlementReviewed:true,fiscalReviewed:true
 });
 assert.equal(parsed.enabled,true);
 for(const k of ["posUnavailable","merchantAuthorizationReviewed","settlementReviewed","fiscalReviewed"] as const)
  assert.throws(()=>parseCheckoutFallbackCommand({...good,[k]:false}),/CHECKOUT_FALLBACK_NOT_ELIGIBLE/);
});
test("revocations allowed with honest negative eligibility, but require an audit reason",()=>{
 const revoked=parseCheckoutFallbackCommand({...good,enabled:false,posUnavailable:false});
 assert.equal(revoked.enabled,false);
 assert.equal(revoked.reviews.posUnavailable,false);
 assert.throws(()=>parseCheckoutFallbackCommand({...good,enabled:false,reason:"x"}),/INVALID_CHECKOUT_FALLBACK_REASON/);
});
test("blocks extra fields, invalid UUIDs, malformed booleans and unreviewed requests",()=>{
 for(const payload of [
 {...good,admin:true},{...good,partnerId:"invalid"},
 {...good,requestKey:"same"},{...good,enabled:"true"},
 {...good,posUnavailable:"true"},{...good,reason:"tiny"},
 {...good,reason:"a".repeat(601)},null,[good],{...good,merchantAuthorizationReviewed:null}
 ])assert.throws(()=>parseCheckoutFallbackCommand(payload));
});
test("fiscal and merchant separation are enforced in admin and SQL data boundaries",()=>{
 const route=source("../src/app/api/admin/hospitality/checkout-fallback/route.ts");
 assert.match(route,/requireAdminSession\(request,\{csrf:true,permission:"vendor\.manage"\}\)/);
 assert.match(route,/get\("origin"\)/);
 const policy=source("../src/lib/drinkstock-checkout-fallback-service.ts");
 assert.match(policy,/FOR UPDATE OF p/);
 assert.match(policy,/NOT \\$2::boolean OR/,"inactive partners remain revocable");
 assert.match(policy,/FROM public\.hospitality_partner_apps/);
 assert.match(policy,/CHECKOUT_REQUEST_KEY_CONFLICT/);
 assert.match(policy,/INSERT INTO public\.drinkstock_checkout_fallback_events/);
 assert.match(policy,/actor_user_id/);
 assert.doesNotMatch(policy,/UPDATE public\.drinkstock_orders/);
 assert.doesNotMatch(policy,/INSERT INTO public\.drinkstock_payment_events/);
 const sql=source("../../../db/operations/20261020_drinkstock_checkout_fallback.sql");
 assert.match(sql,/CHECK \(\s*NOT enabled OR/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(sql,/REVOKE ALL ON public\.drinkstock_checkout_fallback/);
 assert.match(sql,/UNIQUE\(partner_id,request_key\)/);
});
test("guest cart remains no-charge until a real certified adapter exists",()=>{
 const guest=source("../src/components/DrinkStockGuestCart.tsx");
 assert.match(guest,/ONLINE PAYMENT COMING SOON/);
 const preview=source("../src/lib/drinkstock-guest-quote.ts");
 assert.match(preview,/checkoutEnabled:false/);
 const manager=source("../src/lib/drinkstock-session-service.ts");
 assert.match(manager,/checkoutFallbackByPartner\(p\)/);
});

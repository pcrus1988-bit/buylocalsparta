import assert from "node:assert/strict";
import test from "node:test";
import {buildGuestPricePreview} from "../src/lib/drinkstock-guest-quote.ts";
import {prepareDrinkStockCheckoutIntent} from "../src/lib/drinkstock-checkout-preparation.ts";

const beer="11111111-1111-4111-8111-111111111111";
const water="22222222-2222-4222-8222-222222222222";
const session="33333333-3333-4333-8333-333333333333";
const partner="44444444-4444-4444-8444-444444444444";
const venue="55555555-5555-4555-8555-555555555555";
const table="66666666-6666-4666-8666-666666666666";
const nowMs=1700000000000;
const cart=[{productId:beer,quantity:2},{productId:water,quantity:1}];
const products=[
 {id:beer,partnerId:partner,venueId:venue,name:"Draught beer",priceCents:620,
  vatClass:"alcoholic" as const,vatReviewed:true,active:true},
 {id:water,partnerId:partner,venueId:venue,name:"Water",priceCents:124,
  vatClass:"water" as const,vatReviewed:true,active:true}
];
const preview=buildGuestPricePreview({items:cart,
 products:products.map(x=>({id:x.id,name:x.name,priceCents:x.priceCents})),
 session:{id:session,state:"running"},venueId:venue,tableLabel:"A1",nowMs});
const params={
 partnerId:partner,venueId:venue,tablePassId:table,session:{id:session,state:"running"},
 trustedQuote:preview,cart,lockedProducts:products,
 mode:"dine_in" as const,jurisdiction:"standard" as const,islandEligibilityVerified:false,
 nowMs:nowMs+1000
};
test("locked quote splits VAT-inclusive cents and preserves line totals",()=>{
 const intent=prepareDrinkStockCheckoutIntent(params);
 assert.equal(intent.totalGrossCents,1364);
 assert.equal(intent.totalNetCents+intent.totalVatCents,1364);
 assert.deepEqual(intent.lines.map(x=>x.vatRateBasisPoints),[2400,2400]);
 assert.equal(intent.lines[0].grossCents,1240);
 assert.equal(intent.lines[0].vatCents,240);
 assert.equal(intent.lines[1].grossCents,124);
 assert.equal(intent.lines[1].vatCents,24);
 assert.equal(intent.currency,"EUR");
});
test("quote expiration, session change and browser repricing fail shut",()=>{
 for(const changes of [
  {nowMs:nowMs+16000},
  {session:{id:session,state:"paused"}},
  {session:{id:"00000000-0000-4000-8000-000000000000",state:"running"}},
  {trustedQuote:{...preview,totalGrossCents:1}},
  {trustedQuote:{...preview,checkoutEnabled:true as unknown as false}},
  {lockedProducts:[{...products[0],priceCents:621},products[1]]}
 ])assert.throws(()=>prepareDrinkStockCheckoutIntent({...params,...changes}));
});
test("cross-venue, unreviewed VAT and invalid island context are refused",()=>{
 for(const changes of [
  {lockedProducts:[{...products[0],venueId:"foreign"},products[1]]},
  {lockedProducts:[{...products[0],partnerId:"foreign"},products[1]]},
  {lockedProducts:[{...products[0],vatReviewed:false},products[1]]},
  {lockedProducts:[{...products[0],vatClass:"review_required" as const},products[1]]},
  {jurisdiction:"verified_island_reduced" as const}
 ])assert.throws(()=>prepareDrinkStockCheckoutIntent({...params,...changes}));
});
test("takeaway and verified-island rules apply only to server-owned tax context",()=>{
 const takeaway=prepareDrinkStockCheckoutIntent({...params,mode:"takeaway"});
 assert.deepEqual(takeaway.lines.map(x=>x.vatRateBasisPoints),[2400,1300]);
 const island=prepareDrinkStockCheckoutIntent({...params,
  jurisdiction:"verified_island_reduced",islandEligibilityVerified:true});
 assert.deepEqual(island.lines.map(x=>x.vatRateBasisPoints),[1700,1700]);
});

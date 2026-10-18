import assert from "node:assert/strict";
import test from "node:test";
import {validateGuestCart,buildGuestPricePreview,GuestQuoteError,GUEST_PREVIEW_LIFETIME_MS} from "../src/lib/drinkstock-guest-quote.ts";

const beer="11111111-1111-4111-8111-111111111111";
const wine="22222222-2222-4222-8222-222222222222";
const another="33333333-3333-4333-8333-333333333333";
const catalog=[{id:beer,name:"Draught Beer",priceCents:530},{id:wine,name:"House Wine",priceCents:740}];
const live={id:another,state:"running"};
const args={products:catalog,session:live,venueId:"venue_1",tableLabel:"A1",nowMs:1700000000000};

test("guest cart rejects forged client prices, duplicate lines and invalid quantities",()=>{
 assert.deepEqual(validateGuestCart({items:[{productId:beer,quantity:2}]}),[{productId:beer,quantity:2}]);
 for(const input of [
  {items:[{productId:beer,quantity:2,priceCents:1}]},
  {items:[{productId:beer,quantity:1},{productId:beer,quantity:2}]},
  {items:[{productId:beer,quantity:0}]},
  {items:[{productId:beer,quantity:-1}]},
  {items:[{productId:beer,quantity:1.5}]},
  {items:[{productId:"bad",quantity:1}]},
  {items:[{productId:beer,quantity:1}],partnerId:"another_venue"},
  {items:[]},
  {items:Array.from({length:13},()=>({productId:beer,quantity:1}))},
  {items:[{productId:beer,quantity:11}]}
 ])assert.throws(()=>validateGuestCart(input),GuestQuoteError);
});
test("guest cart rejects more than 24 items in total",()=>{
 const items=[beer,wine,another].map(productId=>({productId,quantity:9}));
 assert.throws(()=>validateGuestCart({items}),/CART_LIMIT_EXCEEDED/);
});
test("preview always uses server catalog and integer cents, never a customer value",()=>{
 const items=validateGuestCart({items:[{productId:beer,quantity:2},{productId:wine,quantity:1}]});
 const preview=buildGuestPricePreview({...args,items});
 assert.deepEqual(preview.lines.map(x=>x.lineGrossCents),[1060,740]);
 assert.equal(preview.totalGrossCents,1800);
 assert.equal(preview.checkoutEnabled,false);
 assert.equal(preview.kind,"price_preview_only");
 assert.equal(preview.tableLabel,"A1");
 assert.equal(preview.quotedAt,"2023-11-14T22:13:20.000Z");
 assert.equal(Date.parse(preview.expiresAt)-Date.parse(preview.quotedAt),GUEST_PREVIEW_LIFETIME_MS);
});
test("market crash is tradable but pauses and ended sessions disable previews",()=>{
 const items=validateGuestCart({items:[{productId:beer,quantity:1}]});
 assert.equal(buildGuestPricePreview({...args,session:{...live,state:"crashing"},items}).totalGrossCents,530);
 for(const state of ["paused","ended","scheduled"])
  assert.throws(()=>buildGuestPricePreview({...args,session:{...live,state},items}),/MARKET_NOT_TRADING/);
 assert.throws(()=>buildGuestPricePreview({...args,session:null,items}),/MARKET_NOT_TRADING/);
});
test("cart preview fails shut if products disappear or prices become invalid",()=>{
 const items=validateGuestCart({items:[{productId:beer,quantity:1}]});
 assert.throws(()=>buildGuestPricePreview({...args,items,products:[]}),/DRINK_NOT_AVAILABLE/);
 assert.throws(()=>buildGuestPricePreview({...args,items,products:[{...catalog[0],priceCents:-1}]}),/PRICE_UNAVAILABLE/);
});

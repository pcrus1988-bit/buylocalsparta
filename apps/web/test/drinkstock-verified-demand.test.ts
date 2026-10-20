import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {verifiedDemandPricePreview} from "../src/lib/drinkstock-verified-demand.ts";
const venue="venue-one";
const a={id:"a",venueId:venue,name:"Beer",priceCents:501,minCents:350,maxCents:725,verifiedUnits:8};
const b={id:"b",venueId:venue,name:"Cola",priceCents:403,minCents:282,maxCents:584,verifiedUnits:0};
const c={id:"c",venueId:venue,name:"Wine",priceCents:999,minCents:699,maxCents:1448,verifiedUnits:1};
test("verified demand calculation bids up popular products and eases weaker sellers by one cent",()=>{
 const source=[a,b,c],snapshot=JSON.stringify(source);
 const out=verifiedDemandPricePreview(venue,source);
 assert.equal(out.verifiedUnits,9);
 assert.equal(out.productsWithVerifiedSales,2);
 assert.equal(out.previewOnly,true);
 assert.equal(out.pricingApplied,false);
 assert.deepEqual(out.products.map(x=>x.verifiedUnits),[8,0,1]);
 assert.equal(out.products[0]!.direction,"rising");
 assert.equal(out.products[1]!.direction,"falling");
 assert.equal(out.products[2]!.direction,"falling");
 assert.ok(out.products[0]!.indicativeCents>501);
 assert.ok(out.products[1]!.indicativeCents<403);
 assert.ok(out.products.every(x=>Number.isSafeInteger(x.indicativeCents)));
 assert.equal(JSON.stringify(source),snapshot,"cannot mutate price authority or input order lines");
});
test("no paid orders means no commercial price change or invented volume",()=>{
 const p=verifiedDemandPricePreview(venue,[{...a,verifiedUnits:0},{...b,verifiedUnits:0}]);
 assert.equal(p.verifiedUnits,0);
 assert.deepEqual(p.products.map(x=>x.movementCents),[0,0]);
 assert.deepEqual(verifiedDemandPricePreview(venue,[]).products,[]);
});
test("owner floor ceiling and integer euro cents are respected",()=>{
 const high=verifiedDemandPricePreview(venue,[
  {...a,priceCents:725,verifiedUnits:100},
  {...b,priceCents:282,verifiedUnits:0}
 ]);
 assert.equal(high.products[0]!.indicativeCents,725);
 assert.equal(high.products[1]!.indicativeCents,282);
 assert.ok(high.products.every(x=>x.indicativeCents>=1));
 assert.equal(high.products[0]!.movementCents,0);
});
test("rejects cross-venue inventory, duplicate products, invalid prices and fabricated quantities",()=>{
 const invalid=[
  [a,{...b,venueId:"some-other-venue"}], [a,{...a}],
  [{...a,verifiedUnits:-1}], [{...a,verifiedUnits:1.1}],
  [{...a,verifiedUnits:NaN}], [{...a,verifiedUnits:Infinity}],
  [{...a,priceCents:345}], [{...a,minCents:800}],
  [{...a,priceCents:1.99}], [{...a,verifiedUnits:1e12}],
  Array.from({length:61},(_,i)=>({...a,id:String(i)}))
 ];
 for(const d of invalid)assert.throws(()=>verifiedDemandPricePreview(venue,d),/INVALID_VERIFIED_DEMAND|DUPLICATE_DEMAND_PRODUCT/);
});
test("live report volume is read with payment evidence, scope and no write operation",()=>{
 const source=readFileSync(new URL("../src/lib/drinkstock-reports-service.ts",import.meta.url),"utf8");
 assert.match(source,/VERIFIED_PAYMENT_EVIDENCE_SQL/);
 assert.match(source,/o\.payment_state='paid'/);
 assert.match(source,/o\.currency='EUR'/);
 assert.match(source,/d\.partner_id=\$1::uuid/);
 assert.match(source,/paid\.product_id=d\.id AND paid\.venue_id=d\.venue_id/);
 assert.doesNotMatch(source,/UPDATE public\.drinkstock_products/);
 assert.doesNotMatch(source,/INSERT INTO public\.drinkstock_market_events/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {normalizeGreekLidlOffers,normalizeGreekStores} from "./lidl-standalone-feed.mjs";
const now=new Date("2026-10-23T12:00:00Z");
const candidate=(changes={})=>({
  id:"a",title:"Μελιτζάνες",brand:null,productIds:["0082180"],category:"Store",
  startValidityDate:"2026-10-23T00:00:01+00:00",endValidityDate:"2026-10-25T23:59:59+00:00",
  priceBox:{largePartNumeric:1.59,smallPartNumeric:2.05,priceSymbol:"€",discountMessage:"-22%"},
  ...changes
});
const run=offers=>normalizeGreekLidlOffers({offers},{storeKey:"GR0851",now,observedAt:now.toISOString()});
test("real-schema offer creates an independent Lidl product",()=>{
 const items=run([candidate()]);assert.equal(items.length,1);
 assert.equal(items[0].priceEur,1.59);assert.equal(items[0].referencePriceEur,2.05);
 assert.equal(items[0].retailerProductIds[0],"0082180");
 assert.equal(items[0].matchedPosokaneiId,null);assert.equal(items[0].basketEligible,false);
 assert.equal(items[0].membershipRequirement,"verify_with_retailer");
});
test("expired offers excluded",()=>assert.deepEqual(run([candidate({endValidityDate:"2026-10-22T00:00:00Z"})]),[]));
test("upcoming offers remain clearly marked",()=>{
 const x=run([candidate({startValidityDate:"2026-10-24T00:00:00Z",endValidityDate:"2026-10-29T00:00:00Z"})])[0];
 assert.equal(x.validityStatus,"upcoming");
});
test("currency not EUR excluded",()=>assert.deepEqual(run([candidate({priceBox:{largePartNumeric:1,priceSymbol:"£"}})]),[]));
test("missing numeric price excluded",()=>assert.deepEqual(run([candidate({priceBox:{priceSymbol:"€"}})]),[]));
test("zero price never free",()=>assert.deepEqual(run([candidate({priceBox:{largePartNumeric:0,priceSymbol:"€"}})]),[]));
test("source is not mistaken for barcode",()=>assert.equal(run([candidate()])[0].retailerProductIds[0],"0082180"));
test("duplicate offer id prevented",()=>assert.equal(run([candidate(),candidate()]).length,1));
test("invalid store key rejected",()=>assert.throws(()=>normalizeGreekLidlOffers({offers:[]},{storeKey:"../../",observedAt:now.toISOString()})));
test("unknown loyalty requirements do not create basket prices",()=>assert.equal(run([candidate()])[0].basketEligible,false));
test("store directory validates IDs and normalizes",()=>{
 const s=normalizeGreekStores([{storeKey:"GR0851",name:"Sparti",locality:"Sparti",address:"3km road"}]);
 assert.deepEqual(s.map(x=>x.id),["GR0851"]);
});
test("duplicates in store directory rejected",()=>assert.throws(()=>normalizeGreekStores([{storeKey:"GR0851"},{storeKey:"GR0851"}])));

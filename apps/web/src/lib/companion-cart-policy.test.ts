import assert from "node:assert/strict";
import {test} from "node:test";
import {companionCartRevision,parseCompanionCartPut} from "./companion-cart-policy.ts";
const a="c61f2b2a-1397-47b8-8e63-d82cbed75abe";
const b="cv_12345678";
test("only exact public canonical IDs and legal quantities can be submitted",()=>{
 const r="a".repeat(64);
 assert.deepEqual(parseCompanionCartPut({revision:r,items:[{canonicalVariantId:a,quantity:2},{canonicalVariantId:b,quantity:1}]}),{
  revision:r,items:[{canonicalVariantId:a,quantity:2},{canonicalVariantId:b,quantity:1}]
 });
 for(const items of [
  [{canonicalVariantId:a,quantity:0}], [{canonicalVariantId:a,quantity:100}],
  [{canonicalVariantId:a,quantity:1.5}],[{canonicalVariantId:"../admin",quantity:1}],
  [{canonicalVariantId:a,quantity:1},{canonicalVariantId:a,quantity:3}]
 ]) assert.throws(()=>parseCompanionCartPut({revision:r,items}));
 assert.throws(()=>parseCompanionCartPut({revision:"invalid",items:[]}));
 assert.throws(()=>parseCompanionCartPut({revision:r,items:Array.from({length:101},()=>({canonicalVariantId:b,quantity:1}))}));
});
test("server cart revision changes on quantities, prices and available stock",()=>{
 const item={canonicalVariantId:a,quantity:1,priceMinor:250,title:"Product",available:true};
 const base={id:"cart-1",updatedAt:1700000000,items:[item]};
 const hash=companionCartRevision(base);
 assert.match(hash,/^[a-f0-9]{64}$/);
 assert.notEqual(companionCartRevision({...base,updatedAt:1700000001}),hash);
 assert.notEqual(companionCartRevision({...base,items:[{...item,quantity:2}]}),hash);
 assert.notEqual(companionCartRevision({...base,items:[{...item,priceMinor:251}]}),hash);
 assert.notEqual(companionCartRevision({...base,items:[{...item,available:false}]}),hash);
 assert.equal(companionCartRevision({...base,items:[item]}),hash);
});

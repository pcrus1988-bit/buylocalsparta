import test from "node:test";
import assert from "node:assert/strict";
import {calculateFiscalPreview} from "./fiscal-preview-calculator.ts";

const line=(overrides:Record<string,unknown>={})=>({
 description:"Μονάδα δοκιμής",quantityMilli:1000,unitPriceMinor:10000,
 vatRateBps:2400,discountBps:0,...overrides
});
const preview=(items:unknown[],lane="b2b")=>calculateFiscalPreview({lane,items});

test("basic EUR 100 net at caller-supplied 24% produces 100/24/124",()=>{
 const v=preview([line()]);
 assert.deepEqual(v.totals,{netMinor:10000,vatMinor:2400,grossMinor:12400,discountMinor:0});
 assert.equal(v.kind,"non_fiscal_test_preview");
 assert.equal(v.issuanceEnabled,false);
 assert.equal(v.legalTaxClassification,false);
});
test("3 decimal quantity and 10% discount round half-up by item",()=>{
 const v=preview([line({quantityMilli:2500,unitPriceMinor:199,vatRateBps:1300,discountBps:1000})],"pos");
 assert.deepEqual(v.items.map(x=>[x.beforeDiscountMinor,x.discountMinor,x.netMinor,x.vatMinor,x.grossMinor]),
  [[498,50,448,58,506]]);
 assert.equal(v.totals.grossMinor,506);
});
test("round 0.5 VAT cent half up, never binary float rounding",()=>{
 const v=preview([line({unitPriceMinor:1,vatRateBps:5000})]);
 assert.deepEqual(v.totals,{netMinor:1,vatMinor:1,grossMinor:2,discountMinor:0});
});
test("sum item-rounded amounts without separate invoice-wide recomputation",()=>{
 const v=preview([line({unitPriceMinor:1,vatRateBps:5000}),line({unitPriceMinor:1,vatRateBps:5000})]);
 assert.equal(v.totals.vatMinor,2);
 assert.equal(v.totals.grossMinor,4);
});
test("accept full discount, zero values and all four permitted lanes",()=>{
 for(const lane of ["b2c","pos","b2b","b2g"]){
  const v=preview([line({discountBps:10000,vatRateBps:0})],lane);
  assert.equal(v.totals.grossMinor,0);
  assert.equal(v.issuanceEnabled,false);
 }
});
test("invalid rates, precision, quantities, extra keys and illegal descriptions are rejected",()=>{
 for(const bad of [
  line({vatRateBps:10001}),line({vatRateBps:-1}),line({discountBps:10001}),
  line({discountBps:1.1}),line({quantityMilli:0}),line({quantityMilli:1.5}),
  line({unitPriceMinor:-2}),line({unitPriceMinor:NaN}),line({description:" \nA"}),
  line({description:""}),line({extra:"no"}),line({unitPriceMinor:"100"})
 ])assert.throws(()=>preview([bad]),undefined,JSON.stringify(bad));
});
test("reject item count abuse and unknown top-level metadata",()=>{
 assert.throws(()=>preview([]),/PREVIEW_INVALID_ITEM_COUNT/);
 assert.throws(()=>preview(Array.from({length:31},()=>line())),/PREVIEW_INVALID_ITEM_COUNT/);
 assert.throws(()=>calculateFiscalPreview({lane:"b2c",items:[line()],isIssued:true}),/PREVIEW_UNKNOWN_FIELDS/);
 assert.throws(()=>calculateFiscalPreview({lane:"unlisted",items:[line()]}),/PREVIEW_INVALID_LANE/);
});
test("refuse totals over maximum safe bounded EUR amount",()=>{
 assert.throws(()=>preview(Array.from({length:3},()=>line({
   quantityMilli:1_000_000,unitPriceMinor:1_000_000_000,vatRateBps:10000
 }))),/PREVIEW_AMOUNT_OUT_OF_RANGE/);
});

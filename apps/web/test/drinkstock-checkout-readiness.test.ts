import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES,
 evaluateDrinkStockCheckoutReadiness
} from "../src/lib/drinkstock-checkout-readiness.ts";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const base={
 adminApproved:true,venueActive:true,activeProductCount:3,productsNeedingVatReview:0,
 ...CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES
};
test("An approved partner is still blocked without settlement, PSP and certified receipt integration",()=>{
 const result=evaluateDrinkStockCheckoutReadiness(base);
 assert.equal(result.checkoutLive,false);
 assert.equal(result.status,"integration_pending");
 assert.deepEqual(result.blockers,[
  "VAT_JURISDICTION_UNVERIFIED","MERCHANT_SETTLEMENT_UNAVAILABLE",
  "PSP_PAYMENT_VERIFICATION_UNAVAILABLE","CERTIFIED_RECEIPTS_UNAVAILABLE",
  "REFUND_CREDIT_RECONCILIATION_UNAVAILABLE","COMMERCIAL_ORDER_ADAPTER_UNAVAILABLE"
 ]);
 assert.equal(result.readyCount,4);
 assert.equal(result.totalCount,10);
});
test("Every commercial capability remains unconditionally inactive until independently implemented",()=>{
 assert.ok(Object.values(CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES).every(v=>v===false));
 const superficiallyReady={...base,...Object.fromEntries(
  Object.keys(CURRENT_DRINKSTOCK_PRODUCTION_CAPABILITIES).map(k=>[k,true])
 )};
 assert.equal(evaluateDrinkStockCheckoutReadiness(superficiallyReady).checkoutLive,false);
});
test("Admin approval revocation and unreviewed VAT always block checkout",()=>{
 const noApproval=evaluateDrinkStockCheckoutReadiness({...base,adminApproved:false});
 assert.equal(noApproval.status,"approval_required");
 assert.ok(noApproval.blockers.includes("ADMIN_APPROVAL_REQUIRED"));
 const pending=evaluateDrinkStockCheckoutReadiness({...base,productsNeedingVatReview:2});
 assert.ok(pending.blockers.includes("PRODUCT_VAT_REVIEW_REQUIRED"));
 assert.ok(evaluateDrinkStockCheckoutReadiness({...base,activeProductCount:0})
  .blockers.includes("CATALOGUE_REQUIRED"));
});
test("Invalid catalogue counts fail closed",()=>{
 for(const values of [
  {activeProductCount:-1},{activeProductCount:1.5},
  {productsNeedingVatReview:-1},{activeProductCount:1,productsNeedingVatReview:2}
 ]) assert.throws(()=>evaluateDrinkStockCheckoutReadiness({...base,...values}),/INVALID_READINESS_COUNTS/);
});
test("Venue diagnostic must be authenticated, manager-scoped and non-mutating",()=>{
 const service=read("../src/lib/drinkstock-checkout-readiness-service.ts");
 const route=read("../src/app/api/hospitality/partners/[partnerId]/venues/[venueId]/checkout-readiness/route.ts");
 assert.match(service,/managerSessionView\(userId,partnerId,venueId\)/);
 assert.match(service,/\["owner","manager"\]/);
 assert.match(service,/partner_id=\$1::uuid AND venue_id=\$2::uuid/);
 assert.match(service,/vat_reviewed/);
 assert.match(route,/hospitalityIdentity\(\)/);
 assert.match(route,/private, no-store/);
 assert.doesNotMatch(service,/INSERT INTO|UPDATE public|DELETE FROM/);
 assert.doesNotMatch(route,/POST\(/);
});

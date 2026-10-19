import assert from "node:assert/strict";
import test from "node:test";
import {
 validateNormalizedPosEvent,posEventDedupKey,posSaleMayMoveMarket,PosContractError,
 POS_CAPABILITIES
} from "../src/lib/drinkstock-pos-contract.ts";

const sale={
 eventId:"evt-001",externalOrderId:"check-22",externalLocationId:"venue-42",
 kind:"sale_finalized",occurredAt:"2026-10-19T11:00:00+03:00",currency:"EUR",
 totalGrossCents:1170,
 items:[{externalItemId:"beer:large",quantity:2,unitGrossCents:585,lineGrossCents:1170}]
};
const verified={
 signatureVerified:true,connectionActive:true,providerLocationMatches:true,
 orderPaidConfirmedByProvider:true,mappedToVenueProducts:true,
 activeSessionAtSale:true,notAlreadyProcessed:true,notVoidedOrRefunded:true
};
test("a normalized POS sale preserves immutable integer-cent prices and quantity",()=>{
 const v=validateNormalizedPosEvent(sale);
 assert.equal(v.totalGrossCents,1170);
 assert.equal(v.items[0].quantity,2);
 assert.equal(v.occurredAt,"2026-10-19T08:00:00.000Z");
 assert.equal(v.externalLocationId,"venue-42");
});
test("replays have stable per-connection dedup keys",()=>{
 assert.equal(posEventDedupKey("connection-A","evt-001"),posEventDedupKey("connection-A","evt-001"));
 assert.notEqual(posEventDedupKey("connection-A","evt-001"),posEventDedupKey("connection-B","evt-001"));
 assert.notEqual(posEventDedupKey("connection-A","evt-001"),posEventDedupKey("connection-A","evt-002"));
});
test("unexplained prices and non-integer money are not accepted",()=>{
 assert.throws(()=>validateNormalizedPosEvent({...sale,totalGrossCents:1200}),PosContractError);
 assert.throws(()=>validateNormalizedPosEvent({...sale,totalGrossCents:11.70}),PosContractError);
 assert.throws(()=>validateNormalizedPosEvent({...sale,currency:"USD"}),PosContractError);
 assert.throws(()=>validateNormalizedPosEvent({...sale,items:[{...sale.items[0],quantity:-2}]}),PosContractError);
});
test("missing or malformed sale evidence fails closed",()=>{
 assert.throws(()=>validateNormalizedPosEvent({...sale,eventId:"  "}),PosContractError);
 assert.throws(()=>validateNormalizedPosEvent({...sale,items:[]}),PosContractError);
 assert.throws(()=>validateNormalizedPosEvent({...sale,occurredAt:"not a date"}),PosContractError);
});
test("market movement requires independently verified, scoped and unreversed paid sale",()=>{
 assert.equal(posSaleMayMoveMarket("sale_finalized",verified),true);
 for(const key of Object.keys(verified)){
  assert.equal(posSaleMayMoveMarket("sale_finalized",{...verified,[key]:false}),false,key);
 }
 assert.equal(posSaleMayMoveMarket("sale_voided",verified),false);
 assert.equal(posSaleMayMoveMarket("refund_finalized",verified),false);
});
test("capability declarations distinguish actual POS APIs from payment terminals",()=>{
 assert.ok(POS_CAPABILITIES.includes("sales_read"));
 assert.ok(POS_CAPABILITIES.includes("price_write"));
 assert.ok(POS_CAPABILITIES.includes("payment_status"));
});

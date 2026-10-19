import test from "node:test";
import assert from "node:assert/strict";
import {hasVerifiedPaymentEvidence,parseReportDays,VERIFIED_PAYMENT_EVIDENCE_SQL,ISSUED_RECEIPT_EVIDENCE_SQL} from "../src/lib/drinkstock-payment-evidence.ts";

const verified={
 paymentState:"paid",orderState:"paid",grossCents:1370,
 eventType:"payment_verified",eventAmountCents:1370,
 provider:"mollie",providerEventId:"evt_723",payloadSha256:"a".repeat(64)
};
test("real-order evidence only admits exact authenticated-provider records",()=>{
 assert.equal(hasVerifiedPaymentEvidence(verified),true);
 for(const bad of [
  {paymentState:"pending"}, {paymentState:"unpaid"},{paymentState:"refunded"},
  {orderState:"awaiting_payment"},{orderState:"cancelled"},
  {eventType:"simulation"},{eventType:null},
  {eventAmountCents:0},{eventAmountCents:1369},{eventAmountCents:1371},
  {grossCents:0},{provider:"demo"},{provider:"simulation"},{provider:"test"},{provider:""},
  {providerEventId:" "},{payloadSha256:null},{payloadSha256:"abc"},{payloadSha256:"A".repeat(64)}
 ]) assert.equal(hasVerifiedPaymentEvidence({...verified,...bad}),false,JSON.stringify(bad));
 for(const state of ["accepted","preparing","ready","served"])
  assert.equal(hasVerifiedPaymentEvidence({...verified,orderState:state}),true);
});
test("SQL verification refuses amount mismatches, demo providers and unsigned evidence",()=>{
 assert.match(VERIFIED_PAYMENT_EVIDENCE_SQL,/e\.amount_cents=o\.amount_gross_cents/);
 assert.match(VERIFIED_PAYMENT_EVIDENCE_SQL,/payload_sha256/);
 assert.match(VERIFIED_PAYMENT_EVIDENCE_SQL,/demo/);
 assert.match(VERIFIED_PAYMENT_EVIDENCE_SQL,/provider_event_id/);
 assert.match(ISSUED_RECEIPT_EVIDENCE_SQL,/retail_receipt/);
 assert.match(ISSUED_RECEIPT_EVIDENCE_SQL,/issued_at IS NOT NULL/);
});
test("analytics range is fixed to safe bounded windows",()=>{
 assert.equal(parseReportDays(undefined),30);
 assert.equal(parseReportDays(""),30);
 for(const d of [7,30,90] as const)assert.equal(parseReportDays(String(d)),d);
 for(const bad of [0,1,365,"all","1; DROP TABLE orders",{},-1," 7 ","07"])
  assert.throws(()=>parseReportDays(bad),/INVALID_REPORT_PERIOD/);
});

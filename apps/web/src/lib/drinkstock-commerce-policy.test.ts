import assert from "node:assert/strict";
import test from "node:test";
import {grossVatSplit,mayAdvanceOrder,assertQuoteIsLive} from "./drinkstock-commerce-policy";
import {validateSessionAction,SessionError} from "./drinkstock-session-service";
const key="11111111-1111-4111-8111-111111111111";
test("VAT split is inclusive and cent preserving",()=>{
 const r=grossVatSplit(1240,2400);
 assert.deepEqual(r,{grossCents:1240,netCents:1000,vatCents:240,vatBasisPoints:2400});
 assert.equal(grossVatSplit(1130,1300).vatCents,130);
 assert.throws(()=>grossVatSplit(100,999));
});
test("No fulfilment without confirmed payment",()=>{
 assert.equal(mayAdvanceOrder("awaiting_payment","accepted","unpaid"),false);
 assert.equal(mayAdvanceOrder("paid","accepted","paid"),true);
 assert.equal(mayAdvanceOrder("ready","served","paid"),true);
 assert.equal(mayAdvanceOrder("served","ready","paid"),false);
 assert.equal(mayAdvanceOrder("served","refunded","refunded"),true);
});
test("Expired quotes must be requoted",()=>{
 assert.equal(assertQuoteIsLive(1000,15999),true);
 assert.equal(assertQuoteIsLive(1000,16001),false);
 assert.equal(assertQuoteIsLive(2000,1000),false);
});
test("Manager actions have strict types, request UUIDs and table labels",()=>{
 assert.equal(validateSessionAction({action:"crash",requestKey:key}).action,"crash");
 assert.equal(validateSessionAction({action:"create_table",requestKey:key,tableLabel:"A1"}).tableLabel,"A1");
 assert.throws(()=>validateSessionAction({action:"create_table",requestKey:key,tableLabel:"<script>"}),SessionError);
 assert.throws(()=>validateSessionAction({action:"start",requestKey:"wrong"}),SessionError);
});

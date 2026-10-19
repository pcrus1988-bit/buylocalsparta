import assert from "node:assert/strict";
import test from "node:test";
import {isTvFeedMode,mayDisplayActualOrder,shouldRenderDemoTicker} from "../src/lib/drinkstock-screen-feed-policy.ts";

test("per-TV mode accepts only simulation or actual",()=>{
 assert.equal(isTvFeedMode("simulation"),true);
 assert.equal(isTvFeedMode("actual"),true);
 for(const x of ["live","both","demo",{mode:"actual"},null,undefined,0])assert.equal(isTvFeedMode(x),false);
});
test("actual TV rejects unpaid, unverifiable, cross-venue, refunded and cancelled records",()=>{
 assert.equal(mayDisplayActualOrder("paid","paid","payment_verified",true),true);
 assert.equal(mayDisplayActualOrder("paid","served","payment_verified",true),true);
 assert.equal(mayDisplayActualOrder("pending","paid","payment_verified",true),false);
 assert.equal(mayDisplayActualOrder("unpaid","awaiting_payment","payment_verified",true),false);
 assert.equal(mayDisplayActualOrder("paid","paid",null,true),false);
 assert.equal(mayDisplayActualOrder("paid","paid","simulated",true),false);
 assert.equal(mayDisplayActualOrder("paid","paid","payment_verified",false),false);
 assert.equal(mayDisplayActualOrder("refunded","refunded","payment_verified",true),false);
 assert.equal(mayDisplayActualOrder("paid","cancelled","payment_verified",true),false);
});
test("actual-mode screens never show simulation, even while market crashes",()=>{
 for(const state of ["running","crashing","paused","ended"])
  assert.equal(shouldRenderDemoTicker("actual",state),false);
 assert.equal(shouldRenderDemoTicker("simulation","running"),true);
 assert.equal(shouldRenderDemoTicker("simulation","crashing"),true);
 assert.equal(shouldRenderDemoTicker("simulation","paused"),false);
});

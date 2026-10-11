import test from "node:test";
import assert from "node:assert/strict";
import {fiscalAlertBackoffSeconds,fiscalAlertClassifyProvider,fiscalAlertFinalDecision}
 from "./fiscal-security-alert-delivery-policy.ts";
test("Resend 2xx is only a provider acceptance when it includes an id",()=>{
 assert.deepEqual(fiscalAlertClassifyProvider(200,{id:"a1b2c3d4"}),{kind:"accepted",providerId:"a1b2c3d4"});
 assert.deepEqual(fiscalAlertClassifyProvider(200,{bad:"success"}),{kind:"retry",code:"PROVIDER_RESPONSE_INVALID"});
});
test("timeouts, 429, and provider 5xx retry; invalid payloads and conflicting idempotency dead-letter",()=>{
 for(const status of [408,429,500,503])assert.equal(fiscalAlertClassifyProvider(status,null).kind,"retry");
 assert.deepEqual(fiscalAlertClassifyProvider(409,{name:"concurrent_idempotent_requests"}),
  {kind:"retry",code:"PROVIDER_CONCURRENT"});
 assert.deepEqual(fiscalAlertClassifyProvider(409,{name:"invalid_idempotent_request"}),
  {kind:"dead",code:"PROVIDER_CONFLICT"});
 assert.equal(fiscalAlertClassifyProvider(400,{name:"invalid_sender"}).kind,"dead");
});
test("bounded exponential backoff and window respect provider's 24h dedup horizon",()=>{
 assert.deepEqual([1,2,3,4].map(fiscalAlertBackoffSeconds),[60,120,240,480]);
 assert.equal(fiscalAlertBackoffSeconds(9),7200);
 const transient={kind:"retry",code:"PROVIDER_TRANSIENT"} as const;
 assert.equal(fiscalAlertFinalDecision(transient,7,0).kind,"retry");
 assert.equal(fiscalAlertFinalDecision(transient,8,0).kind,"dead");
 assert.equal(fiscalAlertFinalDecision(transient,1,23*60*60*1000).kind,"dead");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
 parseFiscalResendStatus,retrieveFiscalResendStatus,fiscalReconcileIntervalSeconds
} from "./fiscal-security-alert-provider-status.ts";

const id="uuid-alert_9876",recipient="owner@example.test";
const valid={id,to:[recipient],last_event:"delivered"};
test("reconcile known accepted provider id, recipient and last_event only",()=>{
 assert.deepEqual(parseFiscalResendStatus(valid,id,recipient),
   {kind:"observed",lastEvent:"delivered",receiptType:"email.delivered"});
 assert.deepEqual(parseFiscalResendStatus({...valid,last_event:"bounced"},id,recipient),
   {kind:"observed",lastEvent:"bounced",receiptType:"email.bounced"});
 assert.deepEqual(parseFiscalResendStatus({...valid,last_event:"delivery_delayed"},id,recipient),
   {kind:"observed",lastEvent:"delivery_delayed",receiptType:"email.delivery_delayed"});
 assert.deepEqual(parseFiscalResendStatus({...valid,last_event:"opened"},id,recipient),
   {kind:"observed",lastEvent:"unknown",receiptType:null});
 assert.deepEqual(parseFiscalResendStatus({...valid,last_event:"sent"},id,recipient),
   {kind:"observed",lastEvent:"sent",receiptType:null});
});
test("never reconcile email metadata belonging to another recipient or provider ID",()=>{
 assert.deepEqual(parseFiscalResendStatus({...valid,to:["attacker@example.test"]},id,recipient),
  {kind:"security_error",code:"PROVIDER_RECIPIENT_MISMATCH"});
 for(const bad of [
  {...valid,id:"other-message_1234"},
  {...valid,to:[]},{...valid,to:[recipient,"outsider@example.test"]},
  {...valid,last_event:5},
  {},
  null
 ]) assert.equal(parseFiscalResendStatus(bad,id,recipient).kind,"retry");
});
test("mock provider request is narrowly scoped to the one outbox ID and does not expose credentials",async()=>{
 const calls=[];
 const result=await retrieveFiscalResendStatus({
  messageId:id,recipient,apiKey:"isolated-test-key",
  fetchImpl:async (url,request)=>{
   calls.push({url:String(url),header:request.headers.authorization});
   return Response.json(valid);
  }
 });
 assert.equal(result.kind,"observed");
 assert.deepEqual(calls,[{
  url:"https://api.resend.com/emails/"+id,
  header:"Bearer isolated-test-key"
 }]);
 assert.equal((await retrieveFiscalResendStatus({
  messageId:"../rest-of-account",recipient,apiKey:"fake",
  fetchImpl:()=>{throw new Error("Must not issue a request")}
 })).kind,"retry");
});
test("unknown, mismatched, failed and missing provider states cannot become proof of delivery",async()=>{
 const invalid=await retrieveFiscalResendStatus({
  messageId:id,recipient,apiKey:"ci",
  fetchImpl:async()=>Response.json({...valid,to:["different@example.test"]})
 });
 assert.deepEqual(invalid,{kind:"security_error",code:"PROVIDER_RECIPIENT_MISMATCH"});
 const unavailable=await retrieveFiscalResendStatus({
  messageId:id,recipient,apiKey:"ci",
  fetchImpl:async()=>Response.json({error:"not ready"},{status:404})
 });
 assert.deepEqual(unavailable,{kind:"retry",code:"STATUS_NOT_READY"});
 const malformed=await retrieveFiscalResendStatus({
  messageId:id,recipient,apiKey:"ci",
  fetchImpl:async()=>Response.json({...valid,last_event:null})
 });
 assert.equal(malformed.kind,"retry");
});
test("poll cadence remains bounded and never assumes terminal mailbox receipt",()=>{
 assert.equal(fiscalReconcileIntervalSeconds("delivered",1),7200);
 assert.equal(fiscalReconcileIntervalSeconds("delivery_delayed",1),1800);
 assert.equal(fiscalReconcileIntervalSeconds("sent",1),300);
 assert.equal(fiscalReconcileIntervalSeconds("unknown",12),5400);
});

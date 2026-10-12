import test from "node:test";
import assert from "node:assert/strict";
import {parseFiscalRecoveryInput,FiscalRecoveryInputError} from "./fiscal-mfa-recovery-input.ts";

const caseId="00000000-0000-4000-8000-000000000001";
const evidenceRef="REC-OFFLINE-CASE-001";
test("only the signed-in target can request their own case via validated server path",()=>{
 assert.deepEqual(parseFiscalRecoveryInput({action:"request",evidenceRef}),{action:"request",evidenceRef});
 for(const raw of [
  {action:"request",evidenceRef:"anything"},
  {action:"request",evidenceRef:"REC-SHORT"},
  {action:"request",evidenceRef,actorRef:"somebody-else"},
  {action:"request",evidenceRef:"REC-OFFLINE-CASE-001 ",admin:true},
  {action:"reset",caseId,evidenceRef},null,[],{}
 ]) assert.throws(()=>parseFiscalRecoveryInput(raw),FiscalRecoveryInputError);
});
test("two-person approvals require exact UUID, evidence and explicit true attestation",()=>{
 const good={action:"approve",caseId,evidenceRef,attested:true};
 assert.deepEqual(parseFiscalRecoveryInput(good),good);
 for(const bad of [
  {...good,attested:false},{...good,attested:"true"},
  {...good,caseId:"../../mfa"},{...good,evidenceRef:"https://malicious.example"},
  {...good,targetRef:"forced-target"}, {...good,approvedBy:"self"}, {...good,code:"123456"}
 ]) assert.throws(()=>parseFiscalRecoveryInput(bad),FiscalRecoveryInputError);
});
test("requester may cancel only a bounded case identity",()=>{
 assert.deepEqual(parseFiscalRecoveryInput({action:"cancel",caseId}),{action:"cancel",caseId});
 assert.throws(()=>parseFiscalRecoveryInput({action:"cancel",caseId,evidenceRef}),FiscalRecoveryInputError);
 assert.throws(()=>parseFiscalRecoveryInput({action:"cancel",caseId:"*"}),FiscalRecoveryInputError);
});

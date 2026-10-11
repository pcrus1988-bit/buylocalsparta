import assert from "node:assert/strict";
import {test} from "node:test";
import {parseFiscalReviewInput,fiscalReviewExpectedStatus,fiscalReviewAuditAction,FiscalReviewInputError} from "./fiscal-admin-review.ts";
const organizationId="a0000000-0000-4000-8000-000000000123";
const parse=(action:string,note?:unknown)=>parseFiscalReviewInput({action,organizationId,...(note===undefined?{}:{note})});
test("only a properly shaped review start may enter the KYB workflow",()=>{
 assert.deepEqual(parse("start_review"),{action:"start_review",organizationId});
 assert.equal(fiscalReviewExpectedStatus("start_review"),"pending_review");
 assert.equal(fiscalReviewAuditAction("start_review"),"onboarding.review_started");
 assert.throws(()=>parseFiscalReviewInput({action:"start_review",organizationId,note:"unneeded"}),/REVIEW_NOTE_NOT_ALLOWED/);
});
test("internal case follow-up requires a bounded nonempty note",()=>{
 assert.deepEqual(parse("record_follow_up","  Need signed KYB records.   "),{
  action:"record_follow_up",organizationId,note:"Need signed KYB records."
 });
 assert.equal(fiscalReviewExpectedStatus("record_follow_up"),"under_review");
 assert.equal(fiscalReviewAuditAction("record_follow_up"),"onboarding.internal_follow_up_recorded");
 assert.throws(()=>parse("record_follow_up"),/REVIEW_NOTE_REQUIRED/);
 assert.throws(()=>parse("record_follow_up","short"),/REVIEW_NOTE_INVALID/);
 assert.throws(()=>parse("record_follow_up","a".repeat(1001)),/REVIEW_NOTE_INVALID/);
 assert.throws(()=>parse("record_follow_up","Needs review\u0000corrupted"),/REVIEW_NOTE_INVALID/);
});
test("rejection always has a meaningful internal explanation",()=>{
 const value=parse("reject","  Company verification is incomplete.  ");
 assert.equal(value.note,"Company verification is incomplete.");
 assert.equal(fiscalReviewExpectedStatus("reject"),"under_review");
 assert.equal(fiscalReviewAuditAction("reject"),"onboarding.rejected");
 assert.throws(()=>parse("reject","Too short"),/REVIEW_NOTE_INVALID/);
});
test("approval, foreign identifiers and operator-forged metadata are not accepted",()=>{
 for(const action of ["approve","suspend","send_email","request_info","set_issuance_enabled"]){
  assert.throws(()=>parse(action,"Enough words to pass length."),/INVALID_REVIEW_REQUEST/);
 }
 for(const request of [
  null,[],{action:"start_review",organizationId:"foreign"},
  {action:"start_review",organizationId,isApproved:true},
  {action:"reject",organizationId,note:"Reason meets minimum length.",notificationSent:true},
  {action:"start_review",organizationId,role:"fiscal_admin"}
 ]){
  assert.throws(()=>parseFiscalReviewInput(request),FiscalReviewInputError);
 }
});

import test from "node:test";
import assert from "node:assert/strict";
import {FISCAL_KYB_REVIEW_QUEUE_SQL,summarizeFiscalKybReviewQueue} from "./fiscal-kyb-review-queue.ts";
const a="11111111-1111-4111-8111-111111111111";
const b="22222222-2222-4222-8222-222222222222";
const c="33333333-3333-4333-8333-333333333333";
const row=(id:string,status:string,check_type:string|null=null,outcome:string|null=null)=>({
 id,legal_name:"Synthetic Company "+id.slice(0,4),status,check_type,outcome
});

test("prioritizes unresolved discrepancy without interpreting evidence as approval",()=>{
 const x=summarizeFiscalKybReviewQueue([
  row(a,"under_review","business_registration","evidence_recorded"),
  row(a,"under_review","vat_identity","discrepancy"),
  row(b,"pending_review"),
  row(c,"under_review","vat_identity","requested")
 ]);
 assert.equal(x.length,3);
 assert.equal(x[0].id,a);
 assert.equal(x[0].priority,"follow_up");
 assert.equal(x[0].progress.recordedCount,1);
 assert.equal(x[0].progress.followUpCount,1);
 assert.equal(x[1].id,c);
 assert.equal(x[1].priority,"evidence_pending");
 assert.equal(x[2].id,b);
 assert.equal(x[2].priority,"unstarted");
 assert.ok(x.every(item=>item.progress.identityVerified===false));
 assert.ok(x.every(item=>item.progress.legalApproval===false));
 assert.ok(x.every(item=>item.progress.fiscalIssuanceEnabled===false));
 assert.ok(Object.isFrozen(x));
 assert.ok(x.every(Object.isFrozen));
});
test("all seven recorded check references still require separate verification",()=>{
 const checks=["business_registration","vat_identity","registered_address",
 "legal_representation","beneficial_ownership","signing_authority","service_agreement"];
 const result=summarizeFiscalKybReviewQueue(checks.map(check_type=>
  row(a,"under_review",check_type,"evidence_recorded")));
 assert.equal(result[0].priority,"recorded_for_review");
 assert.equal(result[0].progress.outstandingCount,0);
 assert.equal(result[0].progress.legalApproval,false);
});
test("prevents cross-case contamination and conflicts",()=>{
 assert.throws(()=>summarizeFiscalKybReviewQueue([
  row(a,"pending_review"),{...row(a,"under_review")}]),/KYB_QUEUE_INVALID/);
 assert.throws(()=>summarizeFiscalKybReviewQueue([row(a,"approved")]),/KYB_QUEUE_INVALID/);
 assert.throws(()=>summarizeFiscalKybReviewQueue([row("invalid","pending_review")]),/KYB_QUEUE_INVALID/);
 assert.throws(()=>summarizeFiscalKybReviewQueue(Array(321).fill(row(a,"pending_review"))),/KYB_QUEUE_INVALID/);
 assert.equal(summarizeFiscalKybReviewQueue([]).length,0);
});
test("SQL exposes only minimal attributes and returns latest event without evidence",()=>{
 assert.match(FISCAL_KYB_REVIEW_QUEUE_SQL,/DISTINCT ON \(event\.check_type\)/);
 assert.match(FISCAL_KYB_REVIEW_QUEUE_SQL,/ORDER BY event\.check_type,event\.recorded_at DESC,event\.id DESC/);
 assert.match(FISCAL_KYB_REVIEW_QUEUE_SQL,/LIMIT 40/);
 for(const forbidden of ["source_reference","source_kind","recorded_by_ref","beneficial_owner_name","vat_number","email","details"]){
  assert.ok(!FISCAL_KYB_REVIEW_QUEUE_SQL.includes(forbidden),forbidden);
 }
});

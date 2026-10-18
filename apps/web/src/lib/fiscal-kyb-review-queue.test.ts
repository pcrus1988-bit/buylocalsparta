import test from "node:test";
import assert from "node:assert/strict";
import {FISCAL_KYB_REVIEW_QUEUE_SQL,summarizeFiscalKybReviewQueue,parseFiscalKybReviewCursor,summarizeFiscalKybReviewPage} from "./fiscal-kyb-review-queue.ts";
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
 assert.match(FISCAL_KYB_REVIEW_QUEUE_SQL,/LIMIT 41/);
 assert.match(FISCAL_KYB_REVIEW_QUEUE_SQL,/\$1::timestamptz/);
 assert.match(FISCAL_KYB_REVIEW_QUEUE_SQL,/\$2::uuid/);
 assert.match(FISCAL_KYB_REVIEW_QUEUE_SQL,/created_at_key/);
 for(const forbidden of ["source_reference","source_kind","recorded_by_ref","beneficial_owner_name","vat_number","email","details"]){
  assert.ok(!FISCAL_KYB_REVIEW_QUEUE_SQL.includes(forbidden),forbidden);
 }
});

const stamp="2026-10-18T10:20:30.123456Z";
const caseId=(n:number)=>n.toString(16).padStart(8,"0")+"-0000-4000-8000-000000000000";
const pagedRow=(n:number)=>({...row(caseId(n),"pending_review"),created_at_key:stamp});

test("M30 cursor accepts only precise UTC keyset coordinates and no extra fields",()=>{
 assert.equal(parseFiscalKybReviewCursor(undefined),null);
 const parsed=parseFiscalKybReviewCursor(stamp+"|"+a);
 assert.deepEqual(parsed,{createdAt:stamp,id:a});
 assert.ok(Object.isFrozen(parsed));
 for(const value of [
  "",[],{},42,stamp,"2026-02-31T10:20:30.123456Z|"+a,
  "2026-10-18T10:20:30.123Z|"+a,stamp+"|x",
  stamp+"|"+a+";DROP TABLE fiscal_organizations",
  stamp+"|"+a+"|"+b
 ]){
  assert.throws(()=>parseFiscalKybReviewCursor(value),/KYB_QUEUE_CURSOR_INVALID/);
 }
});

test("M30 pagination exposes all cases across pages without repeating boundary",()=>{
 const rows=Array.from({length:41},(_,index)=>pagedRow(index+1));
 const first=summarizeFiscalKybReviewPage(rows);
 assert.equal(first.cases.length,40);
 assert.equal(first.hasNext,true);
 assert.equal(first.nextCursor,stamp+"|"+caseId(40));
 assert.equal(first.legalApproval,false);
 assert.equal(first.issuanceEnabled,false);
 assert.ok(Object.isFrozen(first));
 assert.ok(Object.isFrozen(first.cases));
 const cursor=parseFiscalKybReviewCursor(first.nextCursor);
 assert.equal(cursor?.id,caseId(40));
 const second=summarizeFiscalKybReviewPage([pagedRow(41)]);
 assert.equal(second.hasNext,false);
 assert.equal(second.nextCursor,null);
 assert.equal(second.cases.length,1);
 assert.ok(!first.cases.some(c=>c.id===second.cases[0].id));
});

test("M30 page rejects malformed coordinates, excessive cases and reordered records",()=>{
 assert.throws(()=>summarizeFiscalKybReviewPage([{
  ...pagedRow(1),created_at_key:"invalid"
 }]),/KYB_QUEUE_PAGE_INVALID|KYB_QUEUE_CURSOR_INVALID/);
 assert.throws(()=>summarizeFiscalKybReviewPage(
  Array.from({length:42},(_,i)=>pagedRow(i+1))
 ),/KYB_QUEUE_PAGE_INVALID/);
 assert.throws(()=>summarizeFiscalKybReviewPage([
  pagedRow(1),pagedRow(2),pagedRow(1)
 ]),/KYB_QUEUE_PAGE_INVALID/);
 const x=summarizeFiscalKybReviewPage([]);
 assert.deepEqual(x.cases,[]);
 assert.equal(x.hasNext,false);
});

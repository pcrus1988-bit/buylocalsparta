import test from "node:test";
import assert from "node:assert/strict";
import {previewFundAllocation,MAZI_FUND_ALLOCATION_VERSION} from "../lib/fund-allocation-policy.ts";
const ID1="10000000-0000-4000-8000-000000000001";
const ID2="10000000-0000-4000-8000-000000000002";
const ID3="10000000-0000-4000-8000-000000000003";
const p=(id,votes,first,request=50_000,min=10_000)=>({
 id,requestedCents:request,minimumUsefulCents:min,supportVotes:votes,
 firstTimeRequester:first,submittedAt:"2026-11-01T00:00:00.000Z",
 approved:true,recused:false
});
const rules=(overrides={})=>({
 budgetCents:100_000,projectCapCents:75_000,maxAwards:5,
 minimumSupportingVotes:1,quorumPercent:20,eligibleBusinesses:10,
 validBallots:5,finalized:true,...overrides
});
test("non-final and below-quorum results never reserve funds",()=>{
 for(const args of [{finalized:false},{validBallots:1,quorumPercent:50}]){
  const got=previewFundAllocation(rules(args),[p(ID1,1,true)]);
  assert.equal(got.quorumReached,false);
  assert.equal(got.awards.length,0);
  assert.equal(got.unallocatedCents,100_000);
 }
});
test("supports several viable projects; total never exceeds budget",()=>{
 const result=previewFundAllocation(rules(),[p(ID1,3,false),p(ID2,1,true),p(ID3,1,true)]);
 assert.equal(result.policyVersion,MAZI_FUND_ALLOCATION_VERSION);
 assert.equal(result.awards.length,3);
 assert.deepEqual(result.awards.map(x=>x.proposalId),[ID2,ID3,ID1]);
 assert.equal(result.awards.reduce((sum,x)=>sum+x.proposedCents,0)+result.unallocatedCents,100_000);
 assert.ok(result.awards.every(x=>x.proposedCents>=10000&&x.proposedCents<=x.requestedCents));
});
test("minimum useful grant and predeclared caps protect against unusable allocations",()=>{
 const got=previewFundAllocation(rules({budgetCents:12_000,projectCapCents:12_000,maxAwards:2}),[
  p(ID1,3,true,25000,11000),p(ID2,2,false,50000,10000)
 ]);
 assert.equal(got.awards.length,1);
 assert.equal(got.awards[0].proposalId,ID1);
 assert.equal(got.awards[0].proposedCents,12000);
 assert.ok(got.excluded.some(x=>x.proposalId===ID2&&x.reason==="insufficient_minimum_budget"));
});
test("retention is based on requested, not awarded amount",()=>{
 const got=previewFundAllocation(rules({budgetCents:40_000}),[p(ID1,5,true,50_001,20_000)]);
 assert.equal(got.awards[0].proposedCents,40_000);
 assert.equal(got.awards[0].retentionMonthsFromRequested,6);
});
test("no unapproved/conflicted, unvoted or impossible-minimum request enters allocation",()=>{
 const got=previewFundAllocation(rules(),[
  {...p(ID1,1,true),approved:false},
  {...p(ID2,2,true),recused:true},
  p(ID3,0,false)
 ]);
 assert.equal(got.awards.length,0);
 assert.equal(got.excluded.length,3);
});
test("integer and identity validation reject forged tallies",()=>{
 assert.throws(()=>previewFundAllocation(rules({validBallots:11}),[]),RangeError);
 assert.throws(()=>previewFundAllocation(rules({budgetCents:0.4}),[]),RangeError);
 assert.throws(()=>previewFundAllocation(rules(),[p(ID1,1,true),p(ID1,1,true)]),RangeError);
 assert.throws(()=>previewFundAllocation(rules(),[p(ID1,9,true)]),RangeError);
});
test("deterministic output regardless of candidate input order",()=>{
 const arr=[p(ID1,3,false),p(ID2,1,true),p(ID3,1,true)];
 const a=previewFundAllocation(rules(),arr);
 const b=previewFundAllocation(rules(),arr.reverse());
 assert.deepEqual(a,b);
});

import test from "node:test";
import assert from "node:assert/strict";
import {approvedMemberIds,rankComparableReviewQueue} from "./comparable-review-queue.mjs";
const p=(id,brand,name,unit_quantity=.5,category="ΠΕΝΝΕΣ ΡΙΓΕ")=>({
  source_product_id:id,brand,name,category,unit:"kg",unit_quantity
});
const products=[
  p("base","ALFA","ALFA Πέννες ριγέ 500g"),
  p("cheap","BETA","BETA Πέννες ριγέ 1kg",1),
  p("badcat","C","C Πέννες ριγέ 500g",.5,"ΡΥΖΙ"),
  p("bio","D","D Πέννες ριγέ βιολογικές 500g"),
  p("same","ALFA","ALFA Πέννες ριγέ 1kg",1),
  p("bad","EAN 1","Πέννες ριγέ 500g")
];
const offer=(price,retailer_id="alpha")=>({price_eur:price,retailer_id,retailer_name:retailer_id});
const prices=new Map([
  ["base",[offer(4)]],["cheap",[offer(1.1,"beta")]],
  ["badcat",[offer(.01)]],["bio",[offer(.01)]],
  ["same",[offer(.01)]],["bad",[offer(.01)]]
]);
const run=(options={})=>rankComparableReviewQueue({products,offersByProduct:prices,...options});
test("queue identifies only source family and cross-brand savings with whole packs",()=>{
  const result=run();
  assert.equal(result.autoApproval,false);
  assert.equal(result.kind,"unverified_comparable_review_queue");
  assert.equal(result.groups.length,1);
  const g=result.groups[0];
  assert.equal(g.requiresHumanApproval,true);
  assert.equal(g.brandCount,2);
  assert.equal(g.comparisonEvidence.originalId,"base");
  assert.equal(g.comparisonEvidence.candidateId,"cheap");
  assert.equal(g.comparisonEvidence.requiredCandidatePacks,1);
  assert.equal(g.potentialSavingEur,2.9);
  assert.deepEqual(g.members.map(x=>x.id).sort(),["base","cheap","same"].sort());
  assert.ok(!g.members.some(x=>["badcat","bio","bad"].includes(x.id)));
});
test("reviewed members can anchor comparisons but approved groups are never rewritten",()=>{
  const reviewed={schema_version:1,groups:[{status:"approved",members:[{id:"base"},{id:"cheap"}]}]};
  assert.deepEqual([...approvedMemberIds(reviewed)].sort(),["base","cheap"]);
  const before=JSON.stringify(reviewed);
  const result=run({approvedGroups:reviewed});
  assert.equal(result.groups.length,1);
  assert.equal(result.groups[0].reviewedCount,2);
  assert.equal(result.groups[0].pendingCount,1);
  assert.equal(JSON.stringify(reviewed),before);
  assert.equal(run({approvedGroups:[{status:"approved",memberIds:["base","cheap","same"]}]}).groups.length,0);
});
test("no price evidence, only one brand, or all approved produces no queue item",()=>{
  assert.equal(run({offersByProduct:new Map([["base",[offer(4)]]])}).groups.length,0);
  const solo=[p("solo","ALFA","ALFA Πέννες ριγέ 1kg",1),p("solo2","ALFA","ALFA Πέννες ριγέ 500g")];
  assert.equal(rankComparableReviewQueue({products:solo,offersByProduct:new Map([["solo",[offer(4)]],["solo2",[offer(1)]]])}).groups.length,0);
});
test("validates limits and never creates an approval marker",()=>{
  assert.throws(()=>run({limit:0}),/limit/);
  assert.throws(()=>run({minBrands:1}),/minBrands/);
  assert.equal(run({limit:1}).groups.length,1);
  assert.ok(!("status" in run().groups[0]));
  assert.ok(!("approvedGroups" in run()));
});

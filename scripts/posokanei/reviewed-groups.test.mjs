import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {buildApprovedReferenceGroups} from "./reviewed-groups.mjs";
import {createBrandIndex,findBrandAlternatives} from "./brand-alternatives.mjs";
const pinned=JSON.parse(readFileSync(fileURLToPath(new URL("./approved-equivalence-groups.json",import.meta.url)),"utf8"));
const products=pinned.groups.flatMap(g=>g.members.map(({id,name,brand,category,unit,unit_quantity})=>({
 source_product_id:id,name,brand,category,unit,unit_quantity
})));
const build=(p=products,data=pinned)=>buildApprovedReferenceGroups(p,data);
test("nine manually reviewed groups are published only for exact source SKUs",()=>{
 const groups=build();
 assert.equal(groups.length,9);
 assert.equal(groups.reduce((n,g)=>n+g.memberIds.length,0),51);
 assert.equal(new Set(groups.flatMap(g=>g.memberIds)).size,51);
 assert.ok(groups.every(g=>g.memberIds.length>=2&&g.status==="approved"));
});
test("source ID reassignments, title drift, brand drift, category drift, and quantity drift revoke entire group",()=>{
 const first=pinned.groups[0],victim=products.find(p=>p.source_product_id===first.members[0].id);
 for(const change of [{name:victim.name+" zero"},{brand:"UNEXPECTED"},{category:"Ακατέργαστη Ζάχαρη"},{unit_quantity:50},{unit:"piece"}]){
  const altered=products.map(p=>p===victim?{...p,...change}:p);
  const groups=build(altered);
  assert.ok(!groups.some(g=>g.id===first.id));
  assert.equal(groups.length,8);
 }
 assert.equal(build(products.filter(p=>p.source_product_id!==victim.source_product_id)).length,8);
});
test("fail closed for unapproved, duplicate and overlapping memberships",()=>{
 assert.equal(build(products,{...pinned,schema_version:2}).length,0);
 const invalid=structuredClone(pinned);
 invalid.groups[0].status="pending";
 assert.ok(!build(products,invalid).some(g=>g.id===pinned.groups[0].id));
 const overlap=structuredClone(pinned);
 overlap.groups[1].members[0]={...overlap.groups[0].members[0]};
 assert.ok(!build(products,overlap).some(g=>g.id===pinned.groups[1].id));
});
test("approved alternatives cross wording differences but unreviewed substitutions remain blocked",()=>{
 const group=build().find(g=>g.id==="tomato-paste-28-30");
 const source=group.memberIds[0],candidate=group.memberIds[1];
 const offers=new Map([[source,[{retailer_id:"a",price_eur:3,retailer_name:"A"}]],
   [candidate,[{retailer_id:"b",price_eur:1,retailer_name:"B"}]]]);
 const params={sourceId:source,products,offersByProduct:offers,
   brandIndex:createBrandIndex(products)};
 const noReview=findBrandAlternatives(params);
 assert.equal(noReview.alternatives.length,0);
 const approved=findBrandAlternatives({...params,approvedGroups:build()});
 assert.ok(approved.alternatives.some(x=>x.id===candidate&&x.confidence==="reviewed_equivalent"));
 assert.ok(approved.alternatives.every(x=>x.savingsEur>0));
 const unavailable=findBrandAlternatives({...params,approvedGroups:build(),excludedRetailerIds:["b"]});
 assert.equal(unavailable.alternatives.length,0);
});

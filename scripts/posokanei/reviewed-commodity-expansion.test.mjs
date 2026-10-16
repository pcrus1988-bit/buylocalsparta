import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildApprovedReferenceGroups} from "./reviewed-groups.mjs";

const registry=JSON.parse(readFileSync(new URL("./approved-equivalence-groups.json",import.meta.url),"utf8"));
const expanded=[
  ["plain-spaghetti-no6",14,"kg"],
  ["wholegrain-spaghetti-no6",4,"kg"],
  ["plain-sunflower-oil",37,"l"],
  ["grated-tomatoes",16,"kg"],
  ["mineral-water-500ml-single",7,"l"],
  ["mineral-water-1500ml-single",7,"l"]
];
const selected=registry.groups.filter(g=>expanded.some(([id])=>id===g.id));
const sampleProduct=p=>({
  source_product_id:p.id,name:p.name,brand:p.brand,
  category:p.category,unit:p.unit,unit_quantity:p.unit_quantity
});
const products=registry.groups.flatMap(g=>g.members.map(sampleProduct));

test("six new reviewed families pin 85 unique source SKUs without overlaps",()=>{
  assert.equal(selected.length,6);
  assert.equal(selected.reduce((n,g)=>n+g.members.length,0),85);
  const all=registry.groups.flatMap(g=>g.members.map(m=>m.id));
  assert.equal(new Set(all).size,all.length);
  for(const [id,length,basis] of expanded){
    const group=selected.find(g=>g.id===id);
    assert.equal(group.members.length,length);
    assert.equal(group.basis,basis);
    assert.ok(group.members.every(m=>m.name&&m.brand&&m.category&&m.unit_quantity>0));
    assert.equal(new Set(group.members.map(m=>m.category)).size,1);
    assert.ok(new Set(group.members.map(m=>m.brand.trim().toLocaleLowerCase("el-GR"))).size>=2);
  }
});

test("protected types remain separate and original descriptions must agree",()=>{
  const members=id=>selected.find(g=>g.id===id).members;
  assert.ok(members("plain-spaghetti-no6").every(m=>
    !/ολικ|χωρις γλουτενη|βιολογικ|protein/i.test(m.name.normalize("NFD").replace(/[\u0300-\u036f]/g,""))));
  assert.ok(members("wholegrain-spaghetti-no6").every(m=>
    /ολικ/i.test(m.name.normalize("NFD").replace(/[\u0300-\u036f]/g,""))));
  assert.ok(members("plain-sunflower-oil").every(m=>/ηλι[εέ]λαιο/i.test(m.name)&&!/αραβοσιτ|ραφιναρισμεν/i.test(m.name.normalize("NFD").replace(/[\u0300-\u036f]/g,""))));
  assert.ok(members("grated-tomatoes").every(m=>
    /τριμμ|τριφτ/i.test(m.name.normalize("NFD").replace(/[\u0300-\u036f]/g,""))&&
    !/passata|πολτος|συμπυκνω|σπιτικ/i.test(m.name.normalize("NFD").replace(/[\u0300-\u036f]/g,""))));
  assert.ok(members("mineral-water-500ml-single").every(m=>m.unit==="L"&&m.unit_quantity===0.5));
  assert.ok(members("mineral-water-1500ml-single").every(m=>m.unit==="L"&&m.unit_quantity===1.5));
});

test("approved matching fails closed on missing and altered pinned source data",()=>{
  const approved=buildApprovedReferenceGroups(products,registry);
  assert.equal(approved.length,registry.groups.length);
  const target=selected[0],missing=products.filter(p=>p.source_product_id!==target.members[0].id);
  assert.equal(buildApprovedReferenceGroups(missing,registry).length,registry.groups.length-1);
  const altered=products.map(p=>p.source_product_id===target.members[0].id
    ?{...p,name:p.name+" modified"}:p);
  assert.equal(buildApprovedReferenceGroups(altered,registry).length,registry.groups.length-1);
});

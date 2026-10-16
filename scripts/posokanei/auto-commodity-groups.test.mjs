import test from "node:test";
import assert from "node:assert/strict";
import {deriveAutoCommodityGroups} from "./auto-commodity-groups.mjs";
import {findBrandAlternatives} from "./brand-alternatives.mjs";

const p=(id,brand,name,category="Ρύζι Μπασμάτι",unit_quantity=.5,unit="kg")=>({
  source_product_id:id,brand,name,category,unit,unit_quantity
});
const products=[
  p("basmati-a","ALFA","ALFA Ρύζι Μπασμάτι 500g"),
  p("basmati-b","BETA","BETA Ρύζι Μπασμάτι 1kg","Ρύζι Μπασμάτι",1),
  p("basmati-special","DELTA","DELTA Ρύζι Μπασμάτι βιολογικό 500g"),
  p("basmati-bad-size","GAMMA","GAMMA Ρύζι Μπασμάτι EXTRA 250g"),
  p("jas-a","ALFA","ALFA Ρύζι Γιασεμί 500g","Ρύζι Γιασεμί"),
  p("jas-b","BETA","BETA Ρύζι Γιασεμί 1kg","Ρύζι Γιασεμί",1),
  p("lentil-a","ALFA","ALFA Φακές Ψιλές 500g","Φακές"),
  p("lentil-b","BETA","BETA Φακές Ψιλές 1000g","Φακές",1),
  p("lentil-red","GAMMA","GAMMA Φακές Κόκκινες 500g","Φακές"),
  p("milk-a","ALFA","ALFA Γάλα Πλήρες 500ml","Γάλα",.5,"l"),
  p("milk-b","BETA","BETA Γάλα Πλήρες 1l","Γάλα",1,"l")
];
const run=(items=products,reviewed=[])=>deriveAutoCommodityGroups(items,reviewed);

test("automatically approves tightly matching dry staples and labels provenance",()=>{
  const result=run();
  assert.equal(result.length,3);
  assert.ok(result.every(g=>g.status==="approved"&&g.approvalMethod==="automatic_commodity"&&g.basis==="kg"));
  const ids=result.map(g=>g.memberIds.join(","));
  assert.ok(ids.includes("basmati-a,basmati-b"));
  assert.ok(ids.includes("jas-a,jas-b"));
  assert.ok(ids.includes("lentil-a,lentil-b"));
  assert.ok(!result.some(g=>g.memberIds.includes("milk-a")||g.memberIds.includes("basmati-special")));
});
test("fails closed on inconsistent package labels, dietary claims and dissimilar types",()=>{
  const bad=[
    p("a","A","A Ρύζι Μπασμάτι 500g"),
    p("badQty","B","B Ρύζι Μπασμάτι 250g"),
    p("organic","C","C Ρύζι Μπασμάτι βιολογικό 500g"),
    p("ready","D","D Ρύζι Μπασμάτι έτοιμο 500g"),
    p("other","E","E Ρύζι Γιασεμί 500g","Ρύζι Γιασεμί"),
    p("unknown","F","F Ρύζι Μπασμάτι", "Ρύζι Μπασμάτι",.5)
  ];
  assert.deepEqual(run(bad),[]);
  assert.equal(run(products.filter(x=>x.source_product_id!=="basmati-b")).
    every(g=>!g.memberIds.includes("basmati-a")),true);
});
test("manual approved members take precedence; automatic groups do not overlap",()=>{
  const reviewed=[{id:"reviewed",status:"approved",memberIds:["basmati-a","basmati-b"]}];
  const generated=run(products,reviewed);
  assert.equal(generated.length,2);
  assert.ok(generated.every(g=>g.memberIds.every(id=>!reviewed[0].memberIds.includes(id))));
});
test("real price-saving engine treats only automatically approved pair as opt-in replacement",()=>{
  const items=products.filter(p=>["basmati-a","basmati-b","basmati-special"].includes(p.source_product_id));
  const groups=run(items);
  const offers=new Map([["basmati-a",[{price_eur:4,retailer_id:"a"}]],
    ["basmati-b",[{price_eur:1,retailer_id:"b"}]],["basmati-special",[{price_eur:.1,retailer_id:"b"}]]]);
  const base={sourceId:"basmati-a",products:items,offersByProduct:offers};
  const noGroups=findBrandAlternatives(base);
  assert.equal(noGroups.alternatives.length,0);
  const res=findBrandAlternatives({...base,approvedGroups:groups});
  assert.equal(res.alternatives.length,1);
  assert.equal(res.alternatives[0].id,"basmati-b");
  assert.equal(res.alternatives[0].approvalMethod,"automatic_commodity");
  assert.equal(res.alternatives[0].savingsEur,3);
});
test("does not approve unbranded, unrelated, unknown-unit, zero-weight or short titles",()=>{
  const b=[
    p("s1","ALFA","ALFA Φακές Ψιλές 500g","Φακές"),
    p("s2","EAN 1","Φακές Ψιλές 500g","Φακές"),
    p("s3","BETA","BETA Φακές 500g","Φακές"),
    p("s4","GAMMA","GAMMA Φακές Ψιλές 0g","Φακές",0)
  ];
  assert.deepEqual(run(b),[]);
  assert.deepEqual(run(null),[]);
});

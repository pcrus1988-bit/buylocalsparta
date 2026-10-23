import test from "node:test";
import assert from "node:assert/strict";
import {deriveAutoTeaSachetGroups} from "./auto-tea-sachet-groups.mjs";
import {findBrandAlternatives} from "./brand-alternatives.mjs";

const p=(id,brand,name,category,grams,unit="kg")=>({
  source_product_id:id,brand,name,category,unit,unit_quantity:grams/1000
});
const green=[
  p("v","VEVI","VEVI ΠΡΑΣΙΝΟ ΤΣΑΪ 10 ΦΑΚ. X 1,5ΓΡ","Τσάι",15),
  p("g","ΓΑΛΑΞΙΑΣ","ΓΑΛΑΞΙΑΣ ΠΡΑΣΙΝΟ ΤΣΑΪ 10 ΦΑΚ. X 1,5ΓΡ","Τσάι",15)
];
test("real source-described 10x1.5g green-tea sachets match across declared brands",()=>{
  const groups=deriveAutoTeaSachetGroups(green);
  assert.deepEqual(groups.map(g=>g.memberIds),[["g","v"]]);
  assert.equal(groups[0].status,"approved");
  assert.equal(groups[0].basis,"kg");
});
test("different counts can only match with same inner sachet weight and corroborated total mass",()=>{
  const extra=p("e","ELENI","ELENI ΠΡΑΣΙΝΟ ΤΣΑΪ 20 ΦΑΚ. X 1,5ΓΡ","Τσάι",30);
  assert.deepEqual(deriveAutoTeaSachetGroups([...green,extra]).map(g=>g.memberIds),[["e","g","v"]]);
  const wrong=p("wrong","OTHER","OTHER ΠΡΑΣΙΝΟ ΤΣΑΪ 20 ΦΑΚ. X 2ΓΡ","Τσάι",40);
  assert.deepEqual(deriveAutoTeaSachetGroups([...green,wrong]).map(g=>g.memberIds),[["g","v"]]);
  const inconsistent={...extra,unit_quantity:0.003};
  assert.deepEqual(deriveAutoTeaSachetGroups([...green,inconsistent]),[]);
});
test("different chamomile mass is NOT equivalent, even when both packages have ten sachets",()=>{
  const herb=[
    p("a","VEVI","VEVI ΧΑΜΟΜΗΛΙ 10 ΦΑΚ. X 1,2ΓΡ","Αφεψήματα",12),
    p("b","ΓΑΛΑΞΙΑΣ","ΓΑΛΑΞΙΑΣ ΧΑΜΟΜΗΛΙ 10 ΦΑΚ. X 1ΓΡ","Αφεψήματα",10)
  ];
  assert.deepEqual(deriveAutoTeaSachetGroups(herb),[]);
  const same=p("c","OTHER","OTHER ΧΑΜΟΜΗΛΙ 10 ΦΑΚ. X 1,2ΓΡ","Αφεψήματα",12);
  assert.deepEqual(deriveAutoTeaSachetGroups([...herb,same]).map(g=>g.memberIds),[["a","c"]]);
});
test("unknown ingredients, mixed/organic/mint/decaf green tea and missing quantities fail closed",()=>{
  const variants=[
    p("organic","A","A ΠΡΑΣΙΝΟ ΤΣΑΪ ΒΙΟΛΟΓΙΚΟ 10 ΦΑΚ. X 1,5ΓΡ","Τσάι",15),
    p("mint","B","B ΠΡΑΣΙΝΟ ΤΣΑΪ ΜΕ ΜΕΝΤΑ 10 ΦΑΚ. X 1,5ΓΡ","Τσάι",15),
    p("mix","C","C ΠΡΑΣΙΝΟ ΤΣΑΪ MIX 10 ΦΑΚ. X 1,5ΓΡ","Τσάι",15),
    p("unknown","D","D ΠΡΑΣΙΝΟ ΤΣΑΪ 10 ΦΑΚ.","Τσάι",15),
    p("single","E","E ΠΡΑΣΙΝΟ ΤΣΑΪ 1 ΦΑΚ. X 1,5ΓΡ","Τσάι",1.5),
    p("differentType","F","F ΧΑΜΟΜΗΛΙ 10 ΦΑΚ. X 1,5ΓΡ","Τσάι",15)
  ];
  assert.deepEqual(deriveAutoTeaSachetGroups(variants),[]);
  const valid=deriveAutoTeaSachetGroups([...green,...variants]);
  assert.deepEqual(valid.map(g=>g.memberIds),[["g","v"]]);
});
test("a contradictory or recycled source ID vetoes the apparent comparison family",()=>{
  const bad={...green[0],source_product_id:"bad",unit_quantity:0.0015};
  assert.deepEqual(deriveAutoTeaSachetGroups([...green,bad]),[]);
  assert.deepEqual(deriveAutoTeaSachetGroups([...green,green[0]]),[]);
  assert.deepEqual(deriveAutoTeaSachetGroups(green,[{status:"approved",memberIds:["v"]}]),[]);
});
test("only genuinely cheaper whole packages may be offered from reviewed sachet groups",()=>{
  const groups=deriveAutoTeaSachetGroups(green);
  const prices=new Map([
    ["v",[{retailer_id:"a",price_eur:2.4}]],
    ["g",[{retailer_id:"b",price_eur:1.8}]]
  ]);
  const unapproved=findBrandAlternatives({sourceId:"v",products:green,
    offersByProduct:prices,approvedGroups:[]});
  assert.deepEqual(unapproved.alternatives,[]);
  const result=findBrandAlternatives({sourceId:"v",products:green,
    offersByProduct:prices,approvedGroups:groups});
  assert.deepEqual(result.alternatives.map(x=>x.id),["g"]);
  assert.equal(result.alternatives[0].savingsEur,0.6);
  prices.set("g",[{retailer_id:"b",price_eur:2.9}]);
  assert.deepEqual(findBrandAlternatives({sourceId:"v",products:green,
    offersByProduct:prices,approvedGroups:groups}).alternatives,[]);
});

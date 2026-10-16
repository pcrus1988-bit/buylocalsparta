import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrandIndex,findBrandAlternatives,productFamily,referenceQuantity
} from "./brand-alternatives.mjs";

const p=(id,name,brand,category="ΝΤΟΜΑΤΑ ΚΟΝΚΑΣΕ",unit="g",unit_quantity=400)=>({
  source_product_id:id,name,brand,category,unit,unit_quantity
});
const products=[
  p("a","ΑΛΦΑ Ντομάτα κονκασέ 400g","ΑΛΦΑ"),
  p("b","ΒΗΤΑ Ντομάτα κονκασέ 500g","ΒΗΤΑ","ΝΤΟΜΑΤΑ ΚΟΝΚΑΣΕ","g",500),
  p("c","ΓΑΜΜΑ Ντομάτα κονκασέ 400g","ΓΑΜΜΑ"),
  p("passata","ΒΗΤΑ Ντομάτα passata 500g","ΒΗΤΑ"),
  p("bio","ΒΗΤΑ Ντομάτα κονκασέ βιολογική 500g","ΒΗΤΑ","ΝΤΟΜΑΤΑ ΚΟΝΚΑΣΕ","g",500),
  p("wrongcat","ΔΕΛΤΑ Ντομάτα κονκασέ 500g","ΔΕΛΤΑ","ΣΑΛΤΣΑ","g",500),
  p("samebrand","ΑΛΦΑ Ντομάτα κονκασέ 1kg","ΑΛΦΑ","ΝΤΟΜΑΤΑ ΚΟΝΚΑΣΕ","kg",1),
  p("milk1","ΩΜΕΓΑ Γάλα πλήρες 3,5% 1lt","ΩΜΕΓΑ","ΓΑΛΑ","l",1),
  p("milk2","ΔΕΛΤΑ Γάλα πλήρες 3,5% 500ml","ΔΕΛΤΑ","ΓΑΛΑ","ml",500),
  p("milkLow","ΖΗΤΑ Γάλα ελαφρύ 1,5% 1lt","ΖΗΤΑ","ΓΑΛΑ","l",1),
  p("shampA","ALPHA shampoo fresh 500ml","ALPHA","SHAMPOO","ml",500),
  p("shampB","BETA shampoo fresh 250ml","BETA","SHAMPOO","ml",250),
  p("shampOther","GAMMA shampoo anti dandruff 250ml","GAMMA","SHAMPOO","ml",250),
  p("unknown","OMEGA unknown tester","OMEGA","UNKNOWN","pack",1),
  p("unbranded","Ντομάτα κονκασέ 400g",null)
];
const o=(id,retailer_id,price_eur)=>({retailer_id,retailer_name:retailer_id,price_eur});
const offers=new Map([
  ["a",[o("a","alpha",1.20),o("a","beta",1.40)]],
  ["b",[o("b","beta",0.55),o("b","alpha",1.25)]],
  ["c",[o("c","alpha",1.30)]],
  ["passata",[o("passata","alpha",0.10)]],
  ["bio",[o("bio","alpha",0.20)]],
  ["wrongcat",[o("wrongcat","alpha",0.20)]],
  ["samebrand",[o("samebrand","alpha",0.20)]],
  ["milk1",[o("milk1","alpha",2.20)]],
  ["milk2",[o("milk2","beta",0.85)]],
  ["milkLow",[o("milkLow","alpha",0.10)]],
  ["shampA",[o("shampA","alpha",8.00)]],
  ["shampB",[o("shampB","beta",2.00)]],
  ["shampOther",[o("shampOther","beta",1.00)]],
  ["unbranded",[o("unbranded","alpha",0.20)]]
]);
const run=(id="a",options={})=>findBrandAlternatives({
  sourceId:id,products,offersByProduct:offers,brandIndex:createBrandIndex(products),
  approvedGroups:[{status:"approved",memberIds:["a","b","c","milk1","milk2","shampA","shampB"]}],...options
});

test("all product families participate, not just named food signatures",()=>{
  const tom=run();
  assert.equal(tom.reason,"cheaper_found");
  assert.deepEqual(tom.alternatives.map(x=>x.id),["b"]);
  const milk=run("milk1");
  assert.equal(milk.alternatives[0].id,"milk2");
  assert.equal(milk.alternatives[0].packageCount,2);
  const shampoo=run("shampA");
  assert.equal(shampoo.alternatives[0].id,"shampB");
  assert.equal(shampoo.alternatives[0].packageCount,2);
});
test("never mix variants, unrelated formats or categories, even at far lower prices",()=>{
  const ids=run().alternatives.map(x=>x.id);
  for(const id of ["passata","bio","wrongcat","samebrand","unbranded"])assert.ok(!ids.includes(id),id);
  const milk=run("milk1").alternatives.map(x=>x.id);
  assert.ok(!milk.includes("milkLow"));
  const shampoo=run("shampA").alternatives.map(x=>x.id);
  assert.ok(!shampoo.includes("shampOther"));
});
test("compute savings on actual basket quantity and whole candidate packages",()=>{
  const result=run("a",{packages:2});
  assert.equal(result.originalTotalEur,2.4);
  assert.equal(result.alternatives[0].packageCount,2);
  assert.equal(result.alternatives[0].candidateTotalEur,1.1);
  assert.equal(result.alternatives[0].savingsEur,1.3);
  const onlySmaller=run("milk1",{packages:3});
  assert.equal(onlySmaller.alternatives[0].packageCount,6);
  assert.equal(onlySmaller.alternatives[0].originalTotalEur,6.6);
  assert.equal(onlySmaller.alternatives[0].candidateTotalEur,5.1);
});
test("excluded supermarkets are excluded, including source baseline",()=>{
  const result=run("a",{excludedRetailerIds:["beta"]});
  assert.equal(result.reason,"no_cheaper_brand");
  assert.equal(result.alternatives.length,0);
  const neither=run("a",{excludedRetailerIds:["alpha","beta"]});
  assert.equal(neither.reason,"no_source_price");
});
test("small unit-price improvements are not called savings when pack rounding costs more",()=>{
  const small=products.concat([
    p("big","ZETA detergent hypoallergenic 1kg","ZETA","DETERGENT","kg",1),
    p("little","EPSILON detergent hypoallergenic 300g","EPSILON","DETERGENT","g",300)
  ]);
  const prices=new Map(offers);
  prices.set("big",[o("big","alpha",5)]);
  prices.set("little",[o("little","alpha",1.45)]);
  const res=findBrandAlternatives({sourceId:"big",products:small,offersByProduct:prices,approvedGroups:[{status:"approved",memberIds:["big","little"]}]});
  assert.equal(res.originalTotalEur,5);
  assert.equal(res.alternatives.length,0); // 4 x €1.45 > €5
});
test("missing evidence doesn't cause false alerts; all valid selections remain inspectable",()=>{
  assert.equal(run("unknown").reason,"unknown_quantity");
  assert.equal(run("unbranded").reason,"no_comparable_brands");
  assert.equal(run("missing").reason,"not_found");
  assert.throws(()=>run("a",{packages:0}),/1–100/);
  assert.throws(()=>run("a",{packages:1.5}),/1–100/);
  assert.throws(()=>run("a",{packages:101}),/1–100/);
  assert.deepEqual(referenceQuantity(products[0]),{unit:"kg",amount:.4});
  assert.ok(productFamily(products[0]));
});
test("preserve dietary markers and fats in signatures",()=>{
  const plain=p("a","Brand γάλα 3,5% 1L","Brand","MILK","l",1);
  const free=p("b","Brand γάλα χωρίς λακτόζη 3,5% 1L","Brand","MILK","l",1);
  assert.notEqual(productFamily(plain),productFamily(free));
  assert.notEqual(productFamily(plain),productFamily(p("c","Brand γάλα 1,5% 1L","Brand","MILK","l",1)));
});

test("a genuine one-cent cheaper alternative is still shown",()=>{
  const duo=[
    p("base","ALPHA Pasta penne 500g","ALPHA","PASTA","g",500),
    p("alt","BETA Pasta penne 500g","BETA","PASTA","g",500)
  ];
  const prices=new Map([
    ["base",[o("base","alpha",1.00)]],["alt",[o("alt","beta",0.99)]]
  ]);
  const match=findBrandAlternatives({sourceId:"base",products:duo,offersByProduct:prices,approvedGroups:[{status:"approved",memberIds:["base","alt"]}]});
  assert.equal(match.alternatives.length,1);
  assert.equal(match.alternatives[0].savingsEur,0.01);
});

test("unreviewed lookalikes never become approved suggestions or auto-substitutions",()=>{
  const result=run("a",{approvedGroups:[]});
  assert.equal(result.reason,"unreviewed_candidates");
  assert.deepEqual(result.alternatives,[]);
  assert.equal(result.candidates[0].id,"b");
  assert.equal(result.candidates[0].confidence,"unverified_match");
  const wrongGroup=run("a",{approvedGroups:[{status:"approved",memberIds:["b","c"]}]});
  assert.deepEqual(wrongGroup.alternatives,[]);
  assert.equal(wrongGroup.candidates[0].id,"b");
  const pending=run("a",{approvedGroups:[{status:"pending",memberIds:["a","b"]}]});
  assert.deepEqual(pending.alternatives,[]);
});

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
  sourceId:id,products,offersByProduct:offers,brandIndex:createBrandIndex(products),...options
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
  const res=findBrandAlternatives({sourceId:"big",products:small,offersByProduct:prices});
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
  const match=findBrandAlternatives({sourceId:"base",products:duo,offersByProduct:prices});
  assert.equal(match.alternatives.length,1);
  assert.equal(match.alternatives[0].savingsEur,0.01);
});


test("Greek inflections and transliterated types match only within detailed category",()=>{
  const items=[
    p("tom1","ΑΛΦΑ Ντομάτες ψιλοκομμένες 400 γρ","ΑΛΦΑ","ΚΟΝΣΕΡΒΑ ΝΤΟΜΑΤΑΣ","g",400),
    p("tom2","BETA diced tomatoes 500g","BETA","ΚΟΝΣΕΡΒΑ ΝΤΟΜΑΤΑΣ","g",500),
    p("tom3","GAMMA tomato passata 500g","GAMMA","ΚΟΝΣΕΡΒΑ ΝΤΟΜΑΤΑΣ","g",500),
    p("tom4","DELTA diced tomato 500g","DELTA","ΚΟΝΣΕΡΒΑ ΣΑΛΤΣΑΣ","g",500)
  ];
  assert.equal(productFamily(items[0]),productFamily(items[1]));
  assert.notEqual(productFamily(items[0]),productFamily(items[2]));
  assert.notEqual(productFamily(items[0]),productFamily(items[3]));
  const prices=new Map([
    ["tom1",[o("tom1","a",2.2)]],["tom2",[o("tom2","b",0.9)]],
    ["tom3",[o("tom3","b",0.1)]],["tom4",[o("tom4","b",0.1)]]
  ]);
  const matched=findBrandAlternatives({sourceId:"tom1",products:items,offersByProduct:prices});
  assert.deepEqual(matched.alternatives.map(x=>x.id),["tom2"]);
});
test("Greek-to-Latin brand matching preserves remainder of product identity",()=>{
  const a=p("a","DODONI γιαούρτι στραγγιστό 500g","ΔΩΔΩΝΗ","ΓΙΑΟΥΡΤΙΑ","g",500);
  const b=p("b","ΒΗΤΑ yogurt στραγγιστό 500g","ΒΗΤΑ","ΓΙΑΟΥΡΤΙΑ","g",500);
  assert.equal(productFamily(a),productFamily(b));
});
test("preserve critical modifiers including diets, strengths, scents and subtypes",()=>{
  const base=p("b","A Γάλα 3,5% πλήρες 1lt","A","ΓΑΛΑ","l",1);
  const variations=[
    p("a","B Γάλα 1,5% πλήρες 1lt","B","ΓΑΛΑ","l",1),
    p("b","B Γάλα 3,5% χωρίς λακτόζη 1lt","B","ΓΑΛΑ","l",1),
    p("c","B Γάλα 3,5% light 1lt","B","ΓΑΛΑ","l",1),
    p("d","B Γάλα 3,5% πλήρες βιολογικό 1lt","B","ΓΑΛΑ","l",1),
    p("e","B Γάλα 3,5% UHT πλήρες 1lt","B","ΓΑΛΑ","l",1),
    p("f","B Γάλα 3,5% πλήρες 2 x 500ml","B","ΓΑΛΑ","ml",1000)
  ];
  for(const alt of variations)assert.notEqual(productFamily(base),productFamily(alt),alt.name);
});
test("safe product-name synonyms also work outside food products",()=>{
  const shampooA=p("s1","MEVGAL ΣΑΜΠΟΥΑΝ FRESH 500ml","MEVGAL","ΠΕΡΙΠΟΙΗΣΗ ΜΑΛΛΙΩΝ","ml",500);
  const shampooB=p("s2","BETA SHAMPOO FRESH 250ml","BETA","ΠΕΡΙΠΟΙΗΣΗ ΜΑΛΛΙΩΝ","ml",250);
  const shampooOther=p("s3","BETA SHAMPOO DRY HAIR 250ml","BETA","ΠΕΡΙΠΟΙΗΣΗ ΜΑΛΛΙΩΝ","ml",250);
  const items=[shampooA,shampooB,shampooOther];
  const prices=new Map([
    ["s1",[o("s1","a",7)]],["s2",[o("s2","b",2)]],["s3",[o("s3","b",0.5)]]
  ]);
  const found=findBrandAlternatives({sourceId:"s1",products:items,offersByProduct:prices});
  assert.deepEqual(found.alternatives.map(x=>x.id),["s2"]);
  assert.equal(found.alternatives[0].packageCount,2);
});
test("no cross-category or incompatible-unit matches after token normalization",()=>{
  const rice=p("r","A Ρύζι νυχάκι 1kg","A","ΡΥΖΙΑ","kg",1);
  const riceBottle=p("b","B rice νυχάκι 1l","B","ΡΥΖΙΑ","l",1);
  const riceOther=p("c","C rice νυχάκι 1kg","C","ΟΣΠΡΙΑ","kg",1);
  assert.notEqual(productFamily(rice),productFamily(riceOther));
  const result=findBrandAlternatives({sourceId:"r",products:[rice,riceBottle,riceOther],
    offersByProduct:new Map([["r",[o("r","a",10)]],["b",[o("b","b",1)]],["c",[o("c","b",1)]]])});
  assert.deepEqual(result.alternatives,[]);
});

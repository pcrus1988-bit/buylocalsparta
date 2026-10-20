import test from "node:test";
import assert from "node:assert/strict";
import {
  productFamily,isAutomaticBrandEquivalent,createBrandIndex,findBrandAlternatives
} from "./brand-alternatives.mjs";
import {deriveAutoPackagedTypeGroups} from "./auto-packaged-type-groups.mjs";

const product=(id,brand,name,quantity)=>({
  source_product_id:id,brand,name,category:"Κόλα",unit:"l",unit_quantity:quantity
});
const products=[
  product("six","ALPHA","ALPHA Κόλα Original 6x330ml",1.98),
  product("four","BETA","BETA Κόλα Original 4 × 330 ml",1.32),
  product("large","GAMMA","GAMMA Κόλα Original 6x500ml",3),
  product("single","DELTA","DELTA Κόλα Original 330ml",0.33),
  product("diet","EPSILON","EPSILON Κόλα Zero 4x330ml",1.32),
  product("bad","OMEGA","OMEGA Κόλα Original 4x330ml",0.5)
];

test("different verified counts of the SAME individual size form one product family",()=>{
  assert.equal(productFamily(products[0]),productFamily(products[1]));
  assert.equal(isAutomaticBrandEquivalent(products[0],products[1]),true);
  for(const other of products.slice(2)){
    assert.notEqual(productFamily(products[0]),productFamily(other),other.name);
    assert.equal(isAutomaticBrandEquivalent(products[0],other),false);
  }
});

test("only fully labelled verified whole-pack comparisons can enter approved auto type groups",()=>{
  // A single contradictory source row vetoes the *whole* affected group.
  assert.deepEqual(deriveAutoPackagedTypeGroups(products),[]);
  const groups=deriveAutoPackagedTypeGroups(products.filter(p=>p.source_product_id!=="bad"));
  assert.deepEqual(groups.map(group=>group.memberIds),[["four","six"]]);
  assert.equal(groups[0].status,"approved");
});

test("whole-pack checkout cost, not unit-price or partial-pack cost, decides cheaper alternatives",()=>{
  const offers=new Map([
    ["six",[{retailer_id:"A",price_eur:7.20}]],
    ["four",[{retailer_id:"A",price_eur:4}]],
    ["large",[{retailer_id:"A",price_eur:0.50}]],
    ["single",[{retailer_id:"A",price_eur:0.10}]],
    ["diet",[{retailer_id:"A",price_eur:0.50}]],
    ["bad",[{retailer_id:"A",price_eur:0.30}]]
  ]);
  const input={sourceId:"six",products,offersByProduct:offers,
    brandIndex:createBrandIndex(products),approvedGroups:[]};
  assert.deepEqual(findBrandAlternatives(input).alternatives,[]);
  offers.set("four",[{retailer_id:"A",price_eur:3}]);
  const result=findBrandAlternatives(input);
  assert.deepEqual(result.alternatives.map(a=>a.id),["four"]);
  assert.equal(result.alternatives[0].packageCount,2);
  assert.equal(result.alternatives[0].candidateTotalEur,6);
  assert.equal(result.alternatives[0].savingsEur,1.2);
});

test("Greek spacing, multiplication glyph and decimal comma normalize only when totals are validated",()=>{
  const left=product("a","ALPHA","ALPHA Κόλα Original 6 x 1,5lt",9);
  const right=product("b","BETA","BETA Κόλα Original 4×1.5 L",6);
  assert.equal(productFamily(left),productFamily(right));
  assert.equal(isAutomaticBrandEquivalent(left,right),true);
  assert.equal(isAutomaticBrandEquivalent(left,{...right,unit_quantity:5}),false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {deriveAutoPackagedTypeGroups} from "./auto-packaged-type-groups.mjs";
import {findBrandAlternatives} from "./brand-alternatives.mjs";

const p=(id,brand,name,quantity)=>({
  source_product_id:id,brand,name,category:"Φυσικό Μεταλλικό Νερό",
  unit:"l",unit_quantity:quantity
});
const products=[
  p("a","NEFELI","NEFELI Νερό Επιτραπέζιο 500ml",0.5),
  p("b","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Νερό Επιτραπέζιο 500ml",0.5),
  p("c","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Νερό Επιτραπέζιο 1.5l",1.5),
  p("min","ΘΕΟΝΗ","ΘΕΟΝΗ Φυσικό Μεταλλικό Νερό 500ml",0.5),
  p("flv","FLAVOUR","FLAVOUR Νερό Επιτραπέζιο με Γεύση Λεμόνι 500ml",0.5),
  p("spark","SODA","SODA Νερό Επιτραπέζιο Ανθρακούχο 500ml",0.5)
];
test("source-labelled plain table water matches across brands without implying mineral identity",()=>{
  const groups=deriveAutoPackagedTypeGroups(products);
  assert.deepEqual(groups.map(g=>g.memberIds),[["a","b","c"]]);
  assert.equal(groups[0].status,"approved");
  assert.equal(groups[0].basis,"l");
});
test("table-water mismatched source quantity and special variants never qualify",()=>{
  const wrong=p("bad","OTHER","OTHER Νερό Επιτραπέζιο 500ml",2);
  assert.deepEqual(deriveAutoPackagedTypeGroups([...products,wrong]),[]);
  const after=deriveAutoPackagedTypeGroups([products[0],products[1]]);
  assert.deepEqual(after.map(g=>g.memberIds),[["a","b"]]);
  assert.deepEqual(deriveAutoPackagedTypeGroups([
    p("1","A","A Νερό Επιτραπέζιο Ανθρακούχο 500ml",.5),
    p("2","B","B Νερό Επιτραπέζιο Ανθρακούχο 500ml",.5)
  ]),[]);
});
test("table-water alternatives require positive savings at the full requested quantity",()=>{
  const approved=deriveAutoPackagedTypeGroups(products);
  const prices=new Map([
    ["a",[{retailer_id:"s",price_eur:.7}]],
    ["b",[{retailer_id:"t",price_eur:.6}]],
    ["c",[{retailer_id:"t",price_eur:1.6}]],
    ["min",[{retailer_id:"s",price_eur:.15}]]
  ]);
  const res=findBrandAlternatives({sourceId:"a",products,
    offersByProduct:prices,approvedGroups:approved});
  assert.deepEqual(res.alternatives.map(x=>x.id),["b"]);
  assert.equal(res.alternatives[0].savingsEur,.1);
  assert.equal(res.alternatives[0].packageCount,1);
  prices.set("b",[{retailer_id:"t",price_eur:.7}]);
  assert.deepEqual(findBrandAlternatives({sourceId:"a",products,
    offersByProduct:prices,approvedGroups:approved}).alternatives,[]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {deriveAutoPackagedTypeGroups} from "./auto-packaged-type-groups.mjs";
import {findBrandAlternatives} from "./brand-alternatives.mjs";
const p=(id,brand,name,category,unit,unit_quantity)=>({
 source_product_id:id,brand,name,category,unit,unit_quantity
});
const chips=[
 p("chips-a","BONORA","BONORA Κυματιστά Πατατάκια με Αλάτι 200g","Πατατάκια","kg",.2),
 p("chips-b","RUFFLES","RUFFLES Κυματιστά Πατατάκια με Αλάτι 140g","Πατατάκια","kg",.14),
 p("chips-rig","LAY'S","LAY'S Πατατάκια με Ρίγανη 210g","Πατατάκια","kg",.21)
];
test("distinct brands and pack sizes match exactly described chip type, not flavors",()=>{
 const g=deriveAutoPackagedTypeGroups(chips);
 assert.equal(g.length,1);
 assert.deepEqual(g[0].memberIds,["chips-a","chips-b"]);
 assert.equal(g[0].approvalMethod,"automatic_commodity");
 assert.equal(g[0].basis,"kg");
});
test("multi-pack volume must match published physical reference quantity",()=>{
 const list=[
  p("water-a","ΘΕΟΝΗ","ΘΕΟΝΗ Φυσικό Μεταλλικό Νερό 6x1,5lt","Φυσικό Μεταλλικό Νερό","l",9),
  p("water-b","ΖΑΓΟΡΙ","ΖΑΓΟΡΙ Νερό Φυσικό Μεταλλικό 6x1,5lt","Φυσικό Μεταλλικό Νερό","l",9),
  p("wrong","ALFA","ALFA Φυσικό Μεταλλικό Νερό 6x1,5lt","Φυσικό Μεταλλικό Νερό","l",1.5)
 ];
 // Contradictory pack evidence blocks approval of the entire family.
 assert.equal(deriveAutoPackagedTypeGroups(list).length,0);
 assert.equal(deriveAutoPackagedTypeGroups(list.slice(0,2)).length,1);
});
test("unrelated olive-oil categories and insufficient extra-virgin wording fail closed",()=>{
 const plain=[
   p("virgin","A","A Παρθένο Ελαιόλαδο 1l","Έξτρα Παρθένο Ελαιόλαδο","l",1),
   p("ordinary","B","B Παρθένο Ελαιόλαδο 2l","Έξτρα Παρθένο Ελαιόλαδο","l",2)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(plain),[]);
 const correct=[
   p("extra-a","A","A Εξαιρετικό Παρθένο Ελαιόλαδο 1lt","Έξτρα Παρθένο Ελαιόλαδο","l",1),
   p("extra-b","B","B Εξαιρετικό Παρθένο Ελαιόλαδο 3lt","Έξτρα Παρθένο Ελαιόλαδο","l",3),
   p("corn","C","C Αραβοσιτέλαιο 2lt","Αραβοσιτέλαιο","l",2)
 ];
 assert.equal(deriveAutoPackagedTypeGroups(correct).length,1);
 assert.deepEqual(deriveAutoPackagedTypeGroups(correct)[0].memberIds,["extra-a","extra-b"]);
});
test("identical source category still needs explicit formulation and verified package sizes",()=>{
 const dairy=[
   p("milk-a","A","A Φρέσκο Γάλα Ελαφρύ 1,5% 1lt","Φρέσκο Γάλα","l",1),
   p("milk-b","B","B Φρέσκο Γάλα Ελαφρύ 1,5% 1lt","Φρέσκο Γάλα","l",1),
   p("milk-other","C","C Φρέσκο Γάλα Πλήρες 3,5% 1lt","Φρέσκο Γάλα","l",1),
   p("milk-lactose","D","D Φρέσκο Γάλα Ελαφρύ 1,5% χωρίς λακτόζη 1lt","Φρέσκο Γάλα","l",1)
 ];
 const g=deriveAutoPackagedTypeGroups(dairy);
 assert.equal(g.length,1);
 assert.deepEqual(g[0].memberIds,["milk-a","milk-b"]);
});
test("no manual SKU overlap; no unreviewed proposal ever upgrades a distinct subtype",()=>{
 const groups=deriveAutoPackagedTypeGroups(chips,[{status:"approved",memberIds:["chips-a","chips-b"]}]);
 assert.deepEqual(groups,[]);
 const two=deriveAutoPackagedTypeGroups(chips.slice(0,2));
 const prices=new Map([["chips-a",[{price_eur:2.4,retailer_id:"a"}]],
 ["chips-b",[{price_eur:1.1,retailer_id:"b"}]],["chips-rig",[{price_eur:.2,retailer_id:"b"}]]]);
 const result=findBrandAlternatives({sourceId:"chips-a",products:chips,offersByProduct:prices,approvedGroups:two});
 assert.deepEqual(result.alternatives.map(x=>x.id),["chips-b"]);
 assert.equal(result.candidates.some(x=>x.id==="chips-rig"),false);
});
test("explicit disallow for alcohol, unsafe product classes, ambiguous claims and pseudo brands",()=>{
 const classes=[
  ["wine","A","A Λευκός Οίνος 750ml","Λευκά Κρασιά","l",.75],
  ["wine2","B","B Λευκός Οίνος 750ml","Λευκά Κρασιά","l",.75],
  ["infant","A","A Βρεφικά Μωρομάντηλα 72τεμ","Μωρομάντηλα","piece",72],
  ["infant2","B","B Βρεφικά Μωρομάντηλα 72τεμ","Μωρομάντηλα","piece",72]
 ].map(x=>p(...x));
 assert.deepEqual(deriveAutoPackagedTypeGroups(classes),[]);
 const a=p("a","A","A Αλάτι Ημίχονδρο 1kg","Αλάτι","kg",1);
 const b=p("b","B","B Αλάτι Ημίχονδρο 1000γρ","Αλάτι","kg",1);
 const c=p("c","EAN 11","Αλάτι Ημίχονδρο 1kg","Αλάτι","kg",1);
 assert.equal(deriveAutoPackagedTypeGroups([a,b,c]).length,1);
 assert.equal(deriveAutoPackagedTypeGroups([a,b,c])[0].memberIds.length,2);
 const surprise=p("d","C","C Αλάτι Ημίχονδρο 1kg","Αλάτι","kg",2);
 assert.deepEqual(deriveAutoPackagedTypeGroups([a,b,surprise]),[]);
});


test("matching croissant fillings may share type, but differing fillings never do",()=>{
 const items=[
  p("ca","A","A Κρουασάν Κρέμα Κακάο 70g","Κρουασάν","kg",.07),
  p("cb","B","B Κρουασάν με Κρέμα Κακάο 90g","Κρουασάν","kg",.09),
  p("cc","C","C Κρουασάν με Κρέμα Πραλίνα 90g","Κρουασάν","kg",.09)
 ];
 const groups=deriveAutoPackagedTypeGroups(items);
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0].memberIds,["ca","cb"]);
});
test("cheese type comparison does not waive diet, label or package checks",()=>{
 const items=[
  p("fa","A","A Φέτα ΠΟΠ σε Άλμη 800g","Φέτα","kg",.8),
  p("fb","B","B Φέτα ΠΟΠ σε Άλμη 400g","Φέτα","kg",.4),
  p("fc","C","C Φέτα ΠΟΠ Light σε Άλμη 800g","Φέτα","kg",.8),
  p("fd","D","D Φέτα ΠΟΠ σε Άλμη 500g","Φέτα","kg",.4)
 ];
 // Incorrect declared quantity on fd is a fail-closed exclusion for
 // a same-name family; source must be corrected before any approval.
 assert.deepEqual(deriveAutoPackagedTypeGroups(items),[]);
 assert.deepEqual(deriveAutoPackagedTypeGroups(items.slice(0,3))[0].memberIds,["fa","fb"]);
});


test("vinegar types can be compared across brands, but not mixed with balsamic or mass-labelled vinegar",()=>{
 const items=[
   p("v-a","ALFA","ALFA Ξίδι από Λευκό Κρασί 1lt","Ξύδι","l",1),
   p("v-b","BETA","BETA Ξίδι από Λευκό Κρασί 500ml","Ξύδι","l",.5),
   p("v-c","GAMMA","GAMMA Ξίδι Βαλσάμικο 1lt","Ξύδι","l",1),
   p("v-bad","DELTA","DELTA Ξίδι από Λευκό Κρασί 400g","Ξύδι","kg",.4)
 ];
 const groups=deriveAutoPackagedTypeGroups(items);
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0].memberIds,["v-a","v-b"]);
});
test("frozen okra and cut pasta keep different variants separate",()=>{
 const items=[
  p("okra-a","ALFA","ALFA Μπάμιες Κατεψυγμένες 1kg","Κατεψυγμένες Μπάμιες","kg",1),
  p("okra-b","BETA","BETA Μπάμιες Κατεψυγμένες 500g","Κατεψυγμένες Μπάμιες","kg",.5),
  p("okra-pre","GAMMA","GAMMA Μπάμιες Κατεψυγμένες Προμαγειρεμένες 1kg","Κατεψυγμένες Μπάμιες","kg",1),
  p("pasta-a","ALFA","ALFA Κοφτό Μακαρόνι 500g","Kοφτό Mακαρόνι","kg",.5),
  p("pasta-b","BETA","BETA Κοφτό Μακαρόνι 1kg","Kοφτό Mακαρόνι","kg",1),
  p("pasta-gf","GAMMA","GAMMA Κοφτό Μακαρόνι χωρίς γλουτένη 500g","Kοφτό Mακαρόνι","kg",.5)
 ];
 const groups=deriveAutoPackagedTypeGroups(items);
 assert.equal(groups.length,2);
 assert.deepEqual(groups.map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["okra-a","okra-b"],["pasta-a","pasta-b"]]);
});

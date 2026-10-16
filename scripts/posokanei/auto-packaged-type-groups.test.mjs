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

test("strawberry kefir is an alternative across packs, not a different fruit flavor",()=>{
 const list=[
  p("k-a","ΕΒΡΟΦΑΡΜΑ","ΕΒΡΟΦΑΡΜΑ Κεφίρ Φράουλα 500ml","Κεφίρ","l",.5),
  p("k-b","ΜΕΒΓΑΛ","ΜΕΒΓΑΛ Κεφίρ Φράουλα 330ml","Κεφίρ","l",.33),
  p("k-c","ΣΤΑΜΟΥ","ΣΤΑΜΟΥ Κεφίρ Κόκκινα Φρούτα 330ml","Κεφίρ","l",.33)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["k-a","k-b"]]);
});
test("powdered cocoa and instant cocoa drink remain separate product types",()=>{
 const list=[
  p("c-a","ΓΙΩΤΗΣ","ΓΙΩΤΗΣ Κακάο Σε Σκόνη 1kg","Σοκολάτα - Κακάο","kg",1),
  p("c-b","BONORA","BONORA Κακάο Σε Σκόνη 125g","Σοκολάτα - Κακάο","kg",.125),
  p("c-mix","HEMO","HEMO Ρόφημα Στιγμής Κακάο 400g","Σοκολάτα - Κακάο","kg",.4)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["c-a","c-b"]]);
});
test("condensed whole milk cannot merge with caramelized sweetened milk",()=>{
 const list=[
  p("m-a","ΒΛΑΧΑΣ","ΒΛΑΧΑΣ Συμπυκνωμένο Γάλα Πλήρες 410g","Εβαπορέ","kg",.41),
  p("m-b","ΝΟΥΝΟΥ","ΝΟΥΝΟΥ Γάλα Συμπυκνωμένο Πλήρες 170g","Εβαπορέ","kg",.17),
  p("m-s","ROYAL","ROYAL Καραμελωμένο Ζαχαρούχο Γάλα 397g","Εβαπορέ","kg",.397)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["m-a","m-b"]]);
});
test("cherry fruit-drinks are comparable, but not the same as pure cherry juice",()=>{
 const list=[
  p("j-a","AMITA","AMITA Φρουτοποτό Βύσσινο 1lt","Χυμός Bύσσινο","l",1),
  p("j-b","MY GUSTO","MY GUSTO Φρουτοποτό Βύσσινο 1lt","Χυμός Bύσσινο","l",1),
  p("j-c","FRUIT","FRUIT Χυμός Βύσσινο 100% 1lt","Χυμός Bύσσινο","l",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["j-a","j-b"]]);
});
test("lemon dishwashing liquid alternatives keep scent and exclude mass-only packs",()=>{
 const list=[
  p("d-a","ECONOMY","ECONOMY Υγρό Πιάτων Λεμόνι 1l","Υγρά πιάτων","l",1),
  p("d-b","ΑΒ","ΑΒ Υγρό Πιάτων Λεμόνι 500ml","Υγρά πιάτων","l",.5),
  p("d-c","GAMMA","GAMMA Υγρό Πιάτων Aloe 500ml","Υγρά πιάτων","l",.5),
  p("d-kg","DELTA","DELTA Υγρό Πιάτων Λεμόνι 500g","Υγρά πιάτων","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["d-a","d-b"]]);
});
test("fresh mozzarella, generic white cheese and smoked turkey stay distinct",()=>{
 const list=[
  p("z-a","GRANAROLO","GRANAROLO Mozzarella Φρέσκια 125g","Λευκό Τυρί","kg",.125),
  p("z-b","ROYAL","ROYAL Mozzarella Φρέσκια 125gr","Λευκό Τυρί","kg",.125),
  p("z-other","ΓΑΛΠΟ","ΓΑΛΠΟ Λευκό Τυρί 400g","Λευκό Τυρί","kg",.4),
  p("t-a","ECONOMY","ECONOMY Γαλοπούλα Καπνιστή Φέτες 160γρ","Αλλαντικά Γαλοπούλας","kg",.16),
  p("t-b","ΑΓΡΟΙΚΙΑ","ΑΓΡΟΙΚΙΑ Γαλοπούλα Καπνιστή Φέτες 160g","Αλλαντικά Γαλοπούλας","kg",.16),
  p("t-gf","BUENAS","BUENAS Καπνιστή Γαλοπούλα Φέτες Χωρίς Γλουτένη 300g","Αλλαντικά Γαλοπούλας","kg",.3)
 ];
 const groups=deriveAutoPackagedTypeGroups(list);
 assert.equal(groups.length,2);
 assert.deepEqual(groups.map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["t-a","t-b"],["z-a","z-b"]]);
});

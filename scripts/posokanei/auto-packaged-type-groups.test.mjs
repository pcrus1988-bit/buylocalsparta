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

test("explicit frozen pea category permits simple brand-neutral pea labels with verified kg packs",()=>{
 const list=[
  p("pea-a","ΛΑΖΑΡΙΔΗ","ΛΑΖΑΡΙΔΗ Αρακάς 900g","Κατεψυγμένος Αρακάς","kg",.9),
  p("pea-b","ΑΙΝΟΣ","ΑΙΝΟΣ Αρακάς 1kg","Κατεψυγμένος Αρακάς","kg",1),
  p("pea-c","THIRD","THIRD Αρακάς Με Καρότο 1kg","Κατεψυγμένος Αρακάς","kg",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["pea-a","pea-b"]]);
});
test("source-described full fat fresh milk may match without numerical fat percentage but not light",()=>{
 const list=[
  p("milk-full-a","ΦΑΡΜΑ ΗΛΕΙΑΣ","ΦΑΡΜΑ ΗΛΕΙΑΣ Φρέσκο Γάλα Πλήρες 1lt","Φρέσκο Γάλα","l",1),
  p("milk-full-b","ΜΑΝΔΡΕΚΑΣ","ΜΑΝΔΡΕΚΑΣ Φρέσκο Γάλα Πλήρες 1lt","Φρέσκο Γάλα","l",1),
  p("milk-light","ΕΒΟΛ","ΕΒΟΛ Φρέσκο Γάλα Ελαφρύ 590ml","Φρέσκο Γάλα","l",.59),
  p("milk-unspecified","OTHER","OTHER Φρέσκο Γάλα 1lt","Φρέσκο Γάλα","l",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["milk-full-a","milk-full-b"]]);
});
test("vinegar spelling variation unifies balsamic type without merging wine vinegar or conflicting physical units",()=>{
 const list=[
  p("v-a","ALFA","ALFA Ξίδι Βαλσάμικο 250ml","Ξύδι","l",.25),
  p("v-b","BETA","BETA Ξύδι Βαλσάμικο 500ml","Ξύδι","l",.5),
  p("v-wine","GAMMA","GAMMA Ξύδι από Λευκό Κρασί 500ml","Ξύδι","l",.5),
  p("v-mass","DELTA","DELTA Ξύδι Βαλσάμικο 250g","Ξύδι","kg",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["v-a","v-b"]]);
});

test("exact traditional sheep and goat yogurt are independent type comparisons",()=>{
 const list=[
  p("s-a","Η ΘΕΡΜΗ","Η ΘΕΡΜΗ Γιαούρτι Πρόβειο Παραδοσιακό 220g","Πρόβειο Γιαούρτι","kg",.22),
  p("s-b","ΓΑΛΠΟ","ΓΑΛΠΟ Πρόβειο Παραδοσιακό Γιαούρτι 240g","Πρόβειο Γιαούρτι","kg",.24),
  p("s-light","OTHER","OTHER Πρόβειο Ελαφρύ Παραδοσιακό Γιαούρτι 200g","Πρόβειο Γιαούρτι","kg",.2),
  p("g-a","ΓΑΛΠΟ","ΓΑΛΠΟ Κατσικίσιο Γιαούρτι Παραδοσιακό 240g","Κατσικίσιο Γιαούρτι","kg",.24),
  p("g-b","ΡΟΔΟΠΗ","ΡΟΔΟΠΗ Γιαούρτι Κατσικίσιο Παραδοσιακό 200g","Κατσικίσιο Γιαούρτι","kg",.2)
 ];
 const matches=deriveAutoPackagedTypeGroups(list);
 assert.deepEqual(matches.map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["g-a","g-b"],["s-a","s-b"]]);
});
test("plain ayran and spinach leaves match only exact source type, not altered preparations",()=>{
 const list=[
  p("a-a","ΟΛΥΜΠΟΣ","ΟΛΥΜΠΟΣ Αριάνι 500ml","Αριάνι","l",.5),
  p("a-b","ΕΒΡΟΦΑΡΜΑ","ΕΒΡΟΦΑΡΜΑ Αριάνι 1lt","Αριάνι","l",1),
  p("spin-a","ΑΙΝΟΣ","ΑΙΝΟΣ Σπανάκι Φύλλα 1kg","Κατεψυγμένο Σπανάκι","kg",1),
  p("spin-b","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Σπανάκι σε Φύλλα 1kg","Κατεψυγμένο Σπανάκι","kg",1),
  p("spin-chopped","BETA","BETA Σπανάκι Ψιλοκομμένο 1kg","Κατεψυγμένο Σπανάκι","kg",1)
 ];
 const matches=deriveAutoPackagedTypeGroups(list);
 assert.deepEqual(matches.map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["a-a","a-b"],["spin-a","spin-b"]]);
});
test("semolina grades, exact pasta shapes and cocoa type remain independently comparable",()=>{
 const list=[
  p("sem-a","MELISSA","MELISSA Σιμιγδάλι Χονδρό 500gr","Σιμιγδάλι","kg",.5),
  p("sem-b","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Σιμιγδάλι Χονδρό 500g","Σιμιγδάλι","kg",.5),
  p("sem-fine","BETA","BETA Σιμιγδάλι Ψιλό 500g","Σιμιγδάλι","kg",.5),
  p("p-a","MISKO","MISKO Μακαρόνια Τρυπητά Νο3 500gr","Ζίτι","kg",.5),
  p("p-b","MELISSA","MELISSA Μακαρόνια Τρυπητά Νο3 500gr","Ζίτι","kg",.5),
  p("p2","BETA","BETA Παστίτσιο Νο2 500g","Ζίτι","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["p-a","p-b"],["sem-a","sem-b"]]);
});
test("white and dark couverture, plain petit beurre and coral pasta are not cross-types",()=>{
 const list=[
  p("w-a","FIN CARRE","FIN CARRE Κουβερτούρα Λευκή 200g","Κουβερτούρα Αρτοποιίας","kg",.2),
  p("w-b","ΙΟΝ","ΙΟΝ Κουβερτούρα Λευκή 125g","Κουβερτούρα Αρτοποιίας","kg",.125),
  p("dark","BETA","BETA Κουβερτούρα Κλασική 125g","Κουβερτούρα Αρτοποιίας","kg",.125),
  p("pb-a","ECONOMY","ECONOMY Μπισκότα Πτι Μπερ 200γρ","Πτι Μπερ","kg",.2),
  p("pb-b","KITBIS","KITBIS Μπισκότα Πτι Μπερ 225g","Πτι Μπερ","kg",.225),
  p("cor-a","COMBINO","COMBINO Κοράλλι 500g","Κοράλλια","kg",.5),
  p("cor-b","MELISSA","MELISSA Κοράλλι 500gr","Κοράλλια","kg",.5)
 ];
 const ids=deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(ids,[["cor-a","cor-b"],["pb-a","pb-b"],["w-a","w-b"]]);
});
test("dishwasher salt excludes dishwasher chemicals, glass cleaner keeps blue versus clear",()=>{
 const list=[
  p("salt-a","MR GRAND","MR GRAND Αλάτι Πλυντηρίου Πιάτων 2kg","Προϊόντα Πλυντηρίου Πιάτων","kg",2),
  p("salt-b","CLEAN HOME","CLEAN HOME Αλάτι Πλυντηρίου Πιάτων 2kg","Προϊόντα Πλυντηρίου Πιάτων","kg",2),
  p("tabs","BETA","BETA Ταμπλέτες Πλυντηρίου Πιάτων 2kg","Προϊόντα Πλυντηρίου Πιάτων","kg",2),
  p("glass-a","MY HOME","MY HOME Υγρό Τζαμιών Blue Ανταλλακτικό 750ml","Καθαρισμός Τζαμιών","l",.75),
  p("glass-b","DROLIO","DROLIO Υγρό Τζαμιών Blue Ανταλλακτικό 1lt","Καθαρισμός Τζαμιών","l",1),
  p("clear","W5","W5 Υγρό Τζαμιών Clear Ανταλλακτικό 1l","Καθαρισμός Τζαμιών","l",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["glass-a","glass-b"],["salt-a","salt-b"]]);
});
test("plain tahini, whole-chickpea size, ground garlic and grated mozzarella retain exact subtypes",()=>{
 const list=[
  p("t-a","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Ταχίνι 900g","Ταχίνι","kg",.9),
  p("t-b","ΓΑΛΑΞΙΑΣ","ΓΑΛΑΞΙΑΣ Ταχίνι 900g","Ταχίνι","kg",.9),
  p("t-whole","BETA","BETA Ταχίνι Ολικής Άλεσης 900g","Ταχίνι","kg",.9),
  p("ch-a","MY KOUZINA","MY KOUZINA Ρεβίθια Χονδρά 500g","Ρεβύθια","kg",.5),
  p("ch-b","MR GRAND","MR GRAND Ρεβίθια Χονδρά 500γρ","Ρεβύθια","kg",.5),
  p("gar-a","ΗΛΙΟΣ","ΗΛΙΟΣ Σκόρδο Τριμμένο 50g","Σκόρδο σε Σκόνη","kg",.05),
  p("gar-b","KANIA","KANIA Σκόρδο Τριμμένο 40g","Σκόρδο σε Σκόνη","kg",.04),
  p("mo-a","ARLA","ARLA Μοτσαρέλα Τριμμένη 200g","Μοτσαρέλα","kg",.2),
  p("mo-b","MILBONA","MILBONA Μοτσαρέλα Τριμμένη 250g","Μοτσαρέλα","kg",.25)
 ];
 const matches=deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(matches,[["ch-a","ch-b"],["gar-a","gar-b"],["mo-a","mo-b"],["t-a","t-b"]]);
});
test("pasta celery and rice-shape products, and spaghetti number, require same detailed type",()=>{
 const list=[
  p("se-a","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Σέλινο 500g","Άλλα Ζυμαρικά","kg",.5),
  p("se-b","MISKO","MISKO Σέλινο 500g","Άλλα Ζυμαρικά","kg",.5),
  p("ri-a","MELISSA","MELISSA Ρυζάκι 500g","Άλλα Ζυμαρικά","kg",.5),
  p("spa-a","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Σπαγγέτι Νο7 500g","Σπαγγέτι","kg",.5),
  p("spa-b","MISKO","MISKO Σπαγγέτι Νο7 500g","Σπαγγέτι","kg",.5),
  p("spa-other","BETA","BETA Σπαγγέτι Νο5 500g","Σπαγγέτι","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["se-a","se-b"],["spa-a","spa-b"]]);
});

test("plain farina and anthotyro are source-described types without spurious one-token rejection",()=>{
 const list=[
  p("fl-a","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Φαρίνα 500g","Φαρίνα","kg",.5),
  p("fl-b","ΑΛΛΑΤΙΝΗ","ΑΛΛΑΤΙΝΗ Φαρίνα 500g","Φαρίνα","kg",.5),
  p("ch-a","ΓΑΛΠΟ","ΓΑΛΠΟ Ανθότυρο 300g","Ανθότυρο","kg",.3),
  p("ch-b","MR GRAND","MR GRAND Ανθότυρο 250gr","Ανθότυρο","kg",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["ch-a","ch-b"],["fl-a","fl-b"]]);
});
test("milk chocolate and powdered cocoa word ordering does not change family identity",()=>{
 const list=[
  p("co-a","ΓΙΩΤΗΣ","ΓΙΩΤΗΣ Κακάο Σε Σκόνη 1kg","Σοκολάτα - Κακάο","kg",1),
  p("co-b","ΙΟΝ","ΙΟΝ Σκόνη Κακάο 125g","Σοκολάτα - Κακάο","kg",.125),
  p("milk-a","BONORA","BONORA Σοκολάτα Γάλακτος 100g","Σοκολάτα Γάλακτος","kg",.1),
  p("milk-b","ΙΟΝ","ΙΟΝ Γάλακτος Σοκολάτα 70g","Σοκολάτα Γάλακτος","kg",.07),
  p("mix","CAOTONIC","CAOTONIC Ρόφημα Στιγμής Κακάο 250g","Σοκολάτα - Κακάο","kg",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["co-a","co-b"],["milk-a","milk-b"]]);
});
test("sliced pariza and differently formulated gluten-free sausage never mix",()=>{
 const list=[
  p("pa-a","ECONOMY","ECONOMY Παρίζα Σε Φέτες 400γρ","Πάριζα Παριζάκι","kg",.4),
  p("pa-b","ΑΒ ΕΠΙΛΟΓΗ","ΑΒ ΕΠΙΛΟΓΗ Πάριζα Φέτες 160g","Πάριζα Παριζάκι","kg",.16),
  p("pa-gf","BUENAS","BUENAS Παριζάκι Χωρίς Γλουτένη 330g","Πάριζα Παριζάκι","kg",.33)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["pa-a","pa-b"]]);
});
test("source category may include spreads but only exactly matched crunchy peanut butter passes",()=>{
 const list=[
  p("p-a","CALVE","CALVE Φυστικοβούτυρο Τραγανό 350g","Μαρμελάδες / Μέλι / Άλειμμα","kg",.35),
  p("p-b","NATURE'S PROMISE","NATURE'S PROMISE Φυστικοβούτυρο Τραγανό 350g","Μαρμελάδες / Μέλι / Άλειμμα","kg",.35),
  p("p-smooth","BETA","BETA Φυστικοβούτυρο Απαλό 350g","Μαρμελάδες / Μέλι / Άλειμμα","kg",.35),
  p("p-honey","OTHER","OTHER Μέλι 350g","Μαρμελάδες / Μέλι / Άλειμμα","kg",.35)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["p-a","p-b"]]);
});
test("fish preservatives and tortellini fillings cannot cross subtype or ingredient basis",()=>{
 const list=[
  p("sa-a","GEISHA","GEISHA Σαρδέλες σε Φυτικό Λάδι 120g","Κονσέρβες Τόνος / Θαλασσινά","kg",.12),
  p("sa-b","TRATA","TRATA Σαρδέλες σε Φυτικό Λάδι 100g","Κονσέρβες Τόνος / Θαλασσινά","kg",.1),
  p("sa-water","BETA","BETA Σαρδέλες Σε Νερό 120g","Κονσέρβες Τόνος / Θαλασσινά","kg",.12),
  p("tor-a","ECONOMY","ECONOMY Τορτελίνια Με Τυρί 250γρ","Τορτελίνια","kg",.25),
  p("tor-b","ΓΑΛΑΞΙΑΣ","ΓΑΛΑΞΙΑΣ Τορτελίνια Με Τυρί 250gr","Τορτελίνια","kg",.25),
  p("tor-m","ALFA","ALFA Τορτελίνια Με Κρέας 250g","Τορτελίνια","kg",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["sa-a","sa-b"],["tor-a","tor-b"]]);
});
test("cola zero remains excluded from plain cola and different chip flavors remain distinct",()=>{
 const list=[
  p("cola-a","ECONOMY","ECONOMY Cola Αναψυκτικό 500ml","Κόλα","l",.5),
  p("cola-b","X","X Cola Αναψυκτικό 1,5lt","Κόλα","l",1.5),
  p("cola-zero","ΒΙΚΟΣ","ΒΙΚΟΣ Cola Zero Χωρίς ζάχαρη 330ml","Κόλα","l",.33),
  p("chip-a","ΑΒ","ΑΒ Τσιπς Αλάτι Κυματιστά 120g","Πατατάκια","kg",.12),
  p("chip-b","SNACK DAY","SNACK DAY Τσιπς Αλάτι Κυματιστά 150g","Πατατάκια","kg",.15),
  p("chip-r","BETA","BETA Τσιπς Ρίγανη 150g","Πατατάκια","kg",.15)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["chip-a","chip-b"],["cola-a","cola-b"]]);
});

test("vanilla dairy dessert versus caramel custard: only the same named type matches",()=>{
 const list=[
 p("v-a","ΝΩΜΑ","ΝΩΜΑ Παραδοσιακή Κρέμα Βανίλια 180g","Επιδόρπιο Κρέμας","kg",.18),
 p("v-b","MY GUSTO","MY GUSTO Παραδοσιακή Κρέμα Βανίλια 180g","Επιδόρπιο Κρέμας","kg",.18),
 p("c-a","ΣΤΑΜΟΥ","ΣΤΑΜΟΥ Κρέμα Καραμελέ 150g","Επιδόρπιο Κρέμας","kg",.15),
 p("c-b","ΜΕΒΓΑΛ","ΜΕΒΓΑΛ Κρέμα Καραμελέ 150g","Επιδόρπιο Κρέμας","kg",.15),
 p("other","OTHER","OTHER Κρέμα Σοκολάτα 180g","Επιδόρπιο Κρέμας","kg",.18)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["c-a","c-b"],["v-a","v-b"]]);
});
test("frozen spinach-rice is comparable by exact meal type, never interchangeable with oily peas",()=>{
 const list=[
 p("s-a","ΕΠΙΛΟΓΗ ΜΟΥ","ΕΠΙΛΟΓΗ ΜΟΥ Σπανακόρυζο Κατεψυγμένο 1kg","Γεύματα","kg",1),
 p("s-b","VEGETERRA","VEGETERRA Σπανακόρυζο Κατεψυγμένο 1kg","Γεύματα","kg",1),
 p("p-a","ΑΒ","ΑΒ Αρακάς Λαδερός 1kg","Γεύματα","kg",1),
 p("p-b","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Αρακάς Λαδερός 1kg","Γεύματα","kg",1),
 p("p-ready","OTHER","OTHER Αρακάς Λαδερός Έτοιμο Γεύμα 1kg","Γεύματα","kg",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["p-a","p-b"],["s-a","s-b"]]);
});
test("raw Pollock fillets do not conflate with breaded or processed fish alternatives",()=>{
 const list=[
 p("f-a","ΑΒ","ΑΒ Μπακαλιάρος Pollock Φιλέτο 850g","Θαλασσινά και Ψάρια","kg",.85),
 p("f-b","7 ΘΑΛΑΣΣΕΣ","7 ΘΑΛΑΣΣΕΣ Μπακαλιάρος Pollock Φιλέτο 600g","Θαλασσινά και Ψάρια","kg",.6),
 p("bread","IGLO","IGLO Ψαροκροκέτες 15τεμ 420g","Θαλασσινά και Ψάρια","kg",.42),
 p("different","OTHER","OTHER Φιλέτο Σολομού 850g","Θαλασσινά και Ψάρια","kg",.85)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["f-a","f-b"]]);
});
test("plain frozen potatoes and raw chicken thigh fillets have independently guarded families",()=>{
 const list=[
 p("p-a","LUTOSA","LUTOSA Κατεψυγμένες Πατάτες 2.5kg","Πατάτες","kg",2.5),
 p("p-b","ECOFROST","ECOFROST Κατεψυγμένες Πατάτες 1kg","Πατάτες","kg",1),
 p("p-type","MCCAIN","MCCAIN Πατάτες Tradition 1kg","Πατάτες","kg",1),
 p("c-a","ΝΙΤΣΙΑΚΟΣ","ΝΙΤΣΙΑΚΟΣ Κοτόπουλο Μπούτι Φιλέτο 700g","Πουλερικά","kg",.7),
 p("c-b","MIMIKOS","MIMIKOS Κοτόπουλο Μπούτι Φιλέτο 650g","Πουλερικά","kg",.65),
 p("c-bread","OTHER","OTHER Κοτόπουλο Μπούτι Φιλέτο Πανέ 650g","Πουλερικά","kg",.65)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["c-a","c-b"],["p-a","p-b"]]);
});
test("only explicitly labelled classic margarine, not cholesterol-lowering special spreads",()=>{
 const list=[
 p("m-a","ΦΑΣΤ","ΦΑΣΤ Classic Μαργαρίνη 225g","Μαργαρίνη","kg",.225),
 p("m-b","ΑΒ","ΑΒ Μαργαρίνη Classic 250g","Μαργαρίνη","kg",.25),
 p("m-generic","MR GRAND","MR GRAND Μαργαρίνη 250g","Μαργαρίνη","kg",.25),
 p("m-function","BENECOL","BENECOL Μαργαρίνη 450g","Μαργαρίνη","kg",.45)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["m-a","m-b"]]);
});
test("Choco Balls child cereals keep the named product type, not a generic chocolate cereal label",()=>{
 const list=[
 p("c-a","BONORA","BONORA Choco Balls Δημητριακά 375g","Παιδικά Δημητριακά","kg",.375),
 p("c-b","ECONOMY","ECONOMY Δημητριακά Choco Balls 500g","Παιδικά Δημητριακά","kg",.5),
 p("other","COOKIE CRISP","COOKIE CRISP Δημητριακά 375g","Παιδικά Δημητριακά","kg",.375)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["c-a","c-b"]]);
});

test("artichokes and frozen mixed vegetables stay in their own quantity-verified food categories",()=>{
 const list=[
 p("a1","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ Αγκινάρες 750g","Κατεψυγμένες Αγκινάρες","kg",.75),
 p("a2","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Αγκινάρες 1kg","Κατεψυγμένες Αγκινάρες","kg",1),
 p("a-bad","OTHER","OTHER Αγκινάρες 500g","Κατεψυγμένες Αγκινάρες","kg",.4),
 p("v1","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Ανάμικτα Λαχανικά 1kg","Κατεψυγμένο Μιξ Λαχανικών","kg",1),
 p("v2","MR GRAND","MR GRAND Ανάμικτα Λαχανικά 450γρ","Κατεψυγμένο Μιξ Λαχανικών","kg",.45),
 p("v-prep","OTHER","OTHER Ανάμικτα Λαχανικά Μαγειρεμένα 1kg","Κατεψυγμένο Μιξ Λαχανικών","kg",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["v1","v2"]]);
 assert.deepEqual(deriveAutoPackagedTypeGroups([list[0],list[1]]).map(g=>g.memberIds),[["a1","a2"]]);
});
test("cornstarch, rice pudding, paprika and regato stay within exact declared product kind",()=>{
 const list=[
 p("n1","ΑΝΘΟΣ","ΑΝΘΟΣ Νισεστές 400g","Νισεστές","kg",.4),
 p("n2","ΩΜΕΓΑ","ΩΜΕΓΑ Νισεστές 425g","Νισεστές","kg",.425),
 p("r1","ΡΟΔΟΠΗ","ΡΟΔΟΠΗ Ρυζόγαλο 160g","Ρυζόγαλο","kg",.16),
 p("r2","ΦΑΡΜΑ ΚΟΥΚΑΚΗ","ΦΑΡΜΑ ΚΟΥΚΑΚΗ Ρυζόγαλο 180g","Ρυζόγαλο","kg",.18),
 p("p1","ΣΚΛΑΒΕΝΙΤΗΣ","ΣΚΛΑΒΕΝΙΤΗΣ Πάπρικα Γλυκιά 50g","Πάπρικα","kg",.05),
 p("p2","MR GRAND","MR GRAND Πάπρικα Γλυκιά 50γρ","Πάπρικα","kg",.05),
 p("p-hot","OTHER","OTHER Πάπρικα Καυτερή 50g","Πάπρικα","kg",.05),
 p("g1","LEADER","LEADER Regato Τριμμένο 200g","Ρεγκάτο","kg",.2),
 p("g2","MR GRAND","MR GRAND Regato Τριμμένο 200gr","Ρεγκάτο","kg",.2)
 ];
 const result=deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(result,[["g1","g2"],["n1","n2"],["p1","p2"],["r1","r2"]]);
});
test("rigatoni, pasta spirals and small lasagne do not substitute across pasta shapes",()=>{
 const list=[
 p("ri1","MISKO","MISKO Ριγκατόνι 500gr","Ριγκατόνι","kg",.5),
 p("ri2","MELISSA","MELISSA Ριγκατόνι 500gr","Ριγκατόνι","kg",.5),
 p("tr1","MISKO","MISKO Τριβελάκι 500g","Στριφτό","kg",.5),
 p("tr2","MR GRAND","MR GRAND Τριβελάκι 500gr","Στριφτό","kg",.5),
 p("la1","MY KOUZINA","MY KOUZINA Λαζανάκι 500g","Λαζάνια","kg",.5),
 p("la2","MELISSA","MELISSA Λαζανάκι 500g","Λαζάνια","kg",.5),
 p("special","OTHER","OTHER Λαζανάκι Χωρίς Γλουτένη 500g","Λαζάνια","kg",.5)
 ];
 const result=deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(result,[["la1","la2"],["ri1","ri2"],["tr1","tr2"]]);
});
test("apple juice, lemon fruit drink and soda brands compare by separately evidenced liquid kind",()=>{
 const list=[
 p("j1","ΑΒ","ΑΒ Χυμός Φυσικός Μήλο 1lt","Χυμός Μήλου","l",1),
 p("j2","ΟΛΥΜΠΟΣ","ΟΛΥΜΠΟΣ Φυσικός Χυμός Μήλο 1lt","Χυμός Μήλου","l",1),
 p("j-pear","OTHER","OTHER Φυσικός Χυμός Αχλάδι 1lt","Χυμός Μήλου","l",1),
 p("le1","AMITA","AMITA Φρουτοποτό Λεμόνι 1lt","Χυμός Εσπεριδοειδών","l",1),
 p("le2","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Φρουτοποτό Λεμόνι 1lt","Χυμός Εσπεριδοειδών","l",1),
 p("s1","SCHWEPPES","SCHWEPPES Σόδα 6x330ml","Σόδα","l",1.98),
 p("s2","TUBORG","TUBORG Σόδα 6x330ml","Σόδα","l",1.98)
 ];
 const result=deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.deepEqual(result,[["j1","j2"],["le1","le2"],["s1","s2"]]);
});
test("coffee roast and preparation style remains anchored to full precise title signature",()=>{
 const list=[
 p("f1","COFFEE ISLAND","COFFEE ISLAND Καφές Φίλτρου Φουντούκι 200g","Καφές Φίλτρου","kg",.2),
 p("f2","MAXWELL HOUSE","MAXWELL HOUSE Καφές Φίλτρου Φουντούκι 225g","Καφές Φίλτρου","kg",.225),
 p("f-m","OTHER","OTHER Καφές Φίλτρου Βανίλια 225g","Καφές Φίλτρου","kg",.225),
 p("e1","ILLY","ILLY Καφές Espresso Decaf Αλεσμένος 250g","Εσπρέσσο","kg",.25),
 p("e2","DIMELLO","DIMELLO Καφές Espresso Decaf Αλεσμένος 250g","Εσπρέσσο","kg",.25),
 p("e3","OTHER","OTHER Καφές Espresso Αλεσμένος 250g","Εσπρέσσο","kg",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["e1","e2"],["f1","f2"]]);
});
test("butter popcorn explicitly matches declared flavor but not plain or cheddar",()=>{
 const list=[
 p("p1","POPPERS","POPPERS Ποπ Κορν με Βούτυρο 86g","Ποπ Κορν","kg",.086),
 p("p2","POPBUSTER","POPBUSTER Ποπ Κορν Βούτυρο 100g","Ποπ Κορν","kg",.1),
 p("other","OTHER","OTHER Ποπ Κορν Cheddar 100g","Ποπ Κορν","kg",.1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["p1","p2"]]);
});

test("generic cod fillets cannot obtain Pollock approval without an explicit Pollock species marker",()=>{
 const list=[
 p("generic-a","A","A Μπακαλιάρος Φιλέτο 800g","Θαλασσινά και Ψάρια","kg",.8),
 p("generic-b","B","B Μπακαλιάρος Φιλέτο 600g","Θαλασσινά και Ψάρια","kg",.6),
 p("real-a","AB","AB Μπακαλιάρος Pollock Φιλέτο 850g","Θαλασσινά και Ψάρια","kg",.85),
 p("real-b","CD","CD Μπακαλιάρος Pollock Φιλέτο 600g","Θαλασσινά και Ψάρια","kg",.6)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["real-a","real-b"]]);
});
test("processed chicken thigh fillets and pre-fried potato variants fail plain raw/frozen approvals",()=>{
 const list=[
 p("ch-a","A","A Κοτόπουλο Μπούτι Φιλέτο Πανέ 700g","Πουλερικά","kg",.7),
 p("ch-b","B","B Κοτόπουλο Μπούτι Φιλέτο Πανέ 650g","Πουλερικά","kg",.65),
 p("mar-a","A","A Κοτόπουλο Μπούτι Φιλέτο Μαριναρισμένο 700g","Πουλερικά","kg",.7),
 p("mar-b","B","B Κοτόπουλο Μπούτι Φιλέτο Μαριναρισμένο 650g","Πουλερικά","kg",.65),
 p("pt-a","A","A Κατεψυγμένες Πατάτες Προτηγανισμένες 1kg","Πατάτες","kg",1),
 p("pt-b","B","B Κατεψυγμένες Πατάτες Προτηγανισμένες 2kg","Πατάτες","kg",2),
 p("raw-a","A","A Κοτόπουλο Μπούτι Φιλέτο 700g","Πουλερικά","kg",.7),
 p("raw-b","B","B Κοτόπουλο Μπούτι Φιλέτο 650g","Πουλερικά","kg",.65)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["raw-a","raw-b"]]);
});

test("exact dark chocolate type and mountain-tea leaves compare only within separately named variants",()=>{
 const list=[
 p("d-a","BONORA","BONORA Σοκολάτα Μαύρη 100g","Μαύρη Σοκολάτα","kg",.1),
 p("d-b","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ Σοκολάτα Μαύρη 85γρ","Μαύρη Σοκολάτα","kg",.085),
 p("t-a","ECONOMY","ECONOMY Τσάι Βουνού 50γρ","Τσάι","kg",.05),
 p("t-b","ΣΚΛΑΒΕΝΙΤΗΣ","ΣΚΛΑΒΕΝΙΤΗΣ Τσάι Βουνού 50g","Τσάι","kg",.05),
 p("green","BRAVO","BRAVO Πράσινο Τσάι 50g","Τσάι","kg",.05)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["d-a","d-b"],["t-a","t-b"]]);
});
test("tomato passata cannot merge with tomato juice or diced tomato despite the source's broad juice category",()=>{
 const list=[
 p("pa-a","ΓΚΡΕΚΑ","ΓΚΡΕΚΑ Τομάτα Passata 500g","Χυμός Ντομάτας","kg",.5),
 p("pa-b","FARMER","FARMER Τομάτα Passata 500gr","Χυμός Ντομάτας","kg",.5),
 p("pa-c","THE RED FARM","THE RED FARM Τομάτα Passata 500g","Χυμός Ντομάτας","kg",.5),
 p("juice","OTHER","OTHER Χυμός Τομάτας 500g","Χυμός Ντομάτας","kg",.5),
 p("diced","OTHER 2","OTHER 2 Τομάτα Ψιλοκομμένη 500g","Χυμός Ντομάτας","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["pa-a","pa-b","pa-c"]]);
});
test("semi-hard cheese and grated hard cheese stay independent within the generic cheese category",()=>{
 const list=[
 p("sh-a","ΓΑΛΠΟ","ΓΑΛΠΟ Τυρί Ημίσκληρο 500g","Τυριά","kg",.5),
 p("sh-b","ECONOMY","ECONOMY Τυρί Ημίσκληρο 370gr","Τυριά","kg",.37),
 p("gr-a","ΓΑΛΠΟ","ΓΑΛΠΟ Σκληρό Τυρί Τριμμένο 250gr","Τυριά","kg",.25),
 p("gr-b","ΟΛΥΜΠΟΣ","ΟΛΥΜΠΟΣ Σκληρό Τυρί Τριμμένο 250g","Τυριά","kg",.25),
 p("other","BETA","BETA Τυρί Μαλακό 250g","Τυριά","kg",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["gr-a","gr-b"],["sh-a","sh-b"]]);
});
test("exact traditional grape-must cookies and fine domestic lentils compare without a recipe waiver",()=>{
 const list=[
 p("mu-a","MY GUSTO","MY GUSTO Μουστοκούλουρα 330g","Βουτήματα","kg",.33),
 p("mu-b","ΓΛΥΚΑΝΘΗ","ΓΛΥΚΑΝΘΗ Μουστοκούλουρα 200g","Βουτήματα","kg",.2),
 p("mu-else","OTHER","OTHER Μουστοκούλουρα Σοκολάτα 200g","Βουτήματα","kg",.2),
 p("le-a","ΣΚΛΑΒΕΝΙΤΗΣ","ΣΚΛΑΒΕΝΙΤΗΣ Φακές Ψιλές Ελληνικές 500g","Φακές","kg",.5),
 p("le-b","FARMER","FARMER Φακές Ψιλές Ελληνικές 500gr","Φακές","kg",.5),
 p("le-bio","OLA BIO","OLA BIO Φακές Ψιλές Ελληνικές 500g","Φακές","kg",.5)
 ];
 // A BIO-marked producer shares this family signature; fail the whole
 // family closed rather than implying its organic product equals conventional.
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["mu-a","mu-b"]]);
 // Without the ambiguous/claim-bearing third product, ordinary lentils can
 // be compared within their explicitly described origin and grain size.
 assert.deepEqual(deriveAutoPackagedTypeGroups(list.filter(x=>x.source_product_id!=="le-bio")).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["le-a","le-b"],["mu-a","mu-b"]]);
});

test("wholegrain tahini is a separate source-labelled comparison, not interchangeable with plain tahini",()=>{
 const list=[
 p("a","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Ταχίνι Ολικής Άλεσης 300g","Ταχίνι","kg",.3),
 p("b","ΟΛΥΜΠΟΣ","ΟΛΥΜΠΟΣ Ταχίνι Ολικής Άλεσης 300g","Ταχίνι","kg",.3),
 p("plain","ΓΑΛΑΞΙΑΣ","ΓΑΛΑΞΙΑΣ Ταχίνι 300g","Ταχίνι","kg",.3),
 p("organic","BETA","BETA Ταχίνι Βιολογικό Ολικής Άλεσης 300g","Ταχίνι","kg",.3)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["a","b"]]);
});
test("source-described wholegrain linguine, oat flakes and rusks preserve their own distinct variants",()=>{
 const list=[
 p("l1","MISKO","MISKO Λιγκουίνι Ολικής Άλεσης 500g","Λιγκουίνι","kg",.5),
 p("l2","MELISSA","MELISSA Λιγκουίνι Ολικής Άλεσης 500g","Λιγκουίνι","kg",.5),
 p("l-regular","OTHER","OTHER Λιγκουίνι 500g","Λιγκουίνι","kg",.5),
 p("o1","QUAKER","QUAKER Νιφάδες Βρώμης Ολικής Άλεσης 500g","Βρώμη","kg",.5),
 p("o2","FYTRO","FYTRO Νιφάδες Βρώμης Ολικής Άλεσης 500g","Βρώμη","kg",.5),
 p("r1","ΑΒ","ΑΒ Παξιμάδια Σταρένια Ολικής Άλεσης 400g","Παξιμάδι","kg",.4),
 p("r2","Η ΛΗΜΝΟΣ","Η ΛΗΜΝΟΣ Παξιμάδια Σταρένια Ολικής Άλεσης 800g","Παξιμάδι","kg",.8),
 p("r-vegan","THIRD","THIRD Παξιμάδια Σταρένια Vegan Ολικής Άλεσης 400g","Παξιμάδι","kg",.4)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["l1","l2"],["o1","o2"],["r1","r2"]]);
});
test("wholegrain breadsticks retain style and vegan/free-from vetoes",()=>{
 const list=[
 p("c1","MR GRAND","MR GRAND Κριτσίνια Ολικής Άλεσης 250γρ","Κριτσίνια","kg",.25),
 p("c2","ΦΑΙΔΩΝ","ΦΑΙΔΩΝ Κριτσίνια Ολικής Άλεσης 400g","Κριτσίνια","kg",.4),
 p("cv1","ELENI","ELENI Κριτσίνια με Καλαμπόκι Vegan 150g","Κριτσίνια","kg",.15),
 p("cv2","ΤΣΑΤΣΑΚΗΣ","ΤΣΑΤΣΑΚΗΣ Κριτσίνια με Καλαμπόκι Vegan 250g","Κριτσίνια","kg",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds),[["c1","c2"]]);
});
test("only exact source-declared gluten-free mustard/ketchup variants share their own comparison family",()=>{
 const list=[
 p("m1","BRAVA","BRAVA Μουστάρδα Απαλή Χωρίς Γλουτένη 430g","Μουστάρδα","kg",.43),
 p("m2","GALAXY","GALAXY Μουστάρδα Απαλή Χωρίς Γλουτένη 520g","Μουστάρδα","kg",.52),
 p("k1","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Κέτσαπ Χωρίς Γλουτένη 560g","Κέτσαπ","kg",.56),
 p("k2","BRAVA","BRAVA Κέτσαπ Χωρίς Γλουτένη 400g","Κέτσαπ","kg",.4),
 p("k-sugar","OTHER","OTHER Κέτσαπ Χωρίς Γλουτένη Χωρίς Ζάχαρη 560g","Κέτσαπ","kg",.56),
 p("m-noclaim","OTHER","OTHER Μουστάρδα Απαλή 430g","Μουστάρδα","kg",.43),
 p("k-organic","OTHER 2","OTHER 2 Κέτσαπ Βιολογικό Χωρίς Γλουτένη 400g","Κέτσαπ","kg",.4)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(list).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["k1","k2"],["m1","m2"]]);
});
test("a generic gluten-free, wholegrain or organic claim never waives restrictions in unrelated categories",()=>{
 const wrong=[
 p("a","A","A Κατεψυγμένες Πατάτες Χωρίς Γλουτένη 1kg","Πατάτες","kg",1),
 p("b","B","B Κατεψυγμένες Πατάτες Χωρίς Γλουτένη 1kg","Πατάτες","kg",1),
 p("c","A","A Φέτα Ολικής Άλεσης 200g","Φέτα","kg",.2),
 p("d","B","B Φέτα Ολικής Άλεσης 200g","Φέτα","kg",.2)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(wrong),[]);
});

test("digestive biscuits, fine vermicelli and filled cocoa biscuits remain specific to their distinct type",()=>{
 const items=[
  p("d1","BONORA","BONORA Digestive Μπισκότα 400g","Μπισκότα Digestive","kg",.4),
  p("d2","SONDEY","SONDEY Μπισκότα Digestive 400g","Μπισκότα Digestive","kg",.4),
  p("f1","MELISSA","MELISSA Φιδές Ψιλός 250gr","Φιδές","kg",.25),
  p("f2","MISKO","MISKO Φιδές Ψιλός 250g","Φιδές","kg",.25),
  p("b1","SONDEY","SONDEY Μπισκότα Γεμιστά με Κακάο 500g","Μπισκότα Γεμιστά, Διάφορες Γεύσεις","kg",.5),
  p("b2","BONORA","BONORA Μπισκότα Γεμιστά με Κακάο 500g","Μπισκότα Γεμιστά, Διάφορες Γεύσεις","kg",.5),
  p("other","BETA","BETA Μπισκότα Γεμιστά με Βανίλια 500g","Μπισκότα Γεμιστά, Διάφορες Γεύσεις","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["b1","b2"],["d1","d2"],["f1","f2"]]);
});
test("Greek star-shaped pasta and tsoureki flour compare only inside their named source category",()=>{
 const items=[
  p("a1","MELISSA","MELISSA Αστράκι 500gr","Μακαρόνια Αστεράκια","kg",.5),
  p("a2","MISKO","MISKO Αστράκι 500g","Μακαρόνια Αστεράκια","kg",.5),
  p("fl1","ΜΥΛΟΙ ΑΓΙΟΥ ΓΕΩΡΓΙΟΥ","ΜΥΛΟΙ ΑΓΙΟΥ ΓΕΩΡΓΙΟΥ Αλεύρι για Τσουρέκι 1kg","Αλεύρι για τσουρέκι","kg",1),
  p("fl2","ΑΒ ΕΠΙΛΟΓΗ","ΑΒ ΕΠΙΛΟΓΗ Αλεύρι για Τσουρέκι 1kg","Αλεύρι για τσουρέκι","kg",1),
  p("normal","OTHER","OTHER Αλεύρι για όλες τις χρήσεις 1kg","Αλεύρι για τσουρέκι","kg",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["a1","a2"],["fl1","fl2"]]);
});
test("frozen sweetcorn and beans-hantres must match exact named frozen ingredient and complete pack",()=>{
 const items=[
  p("c1","MR GRAND","MR GRAND Καλαμπόκι Κατεψυγμένο 1kg","Κατεψυγμένο Καλαμπόκι","kg",1),
  p("c2","ECONOMY","ECONOMY Καλαμπόκι Κατεψυγμένο 750γρ","Κατεψυγμένο Καλαμπόκι","kg",.75),
  p("h1","ΑΙΝΟΣ","ΑΙΝΟΣ Φασόλια Χάντρες 1kg","Κατεψυγμένα Φασόλια","kg",1),
  p("h2","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ Φασόλια Χάντρες 600g","Κατεψυγμένα Φασόλια","kg",.6),
  p("other","FARMER","FARMER Φασόλια Γίγαντες 600g","Κατεψυγμένα Φασόλια","kg",.6),
  p("wrong","WRONG","WRONG Καλαμπόκι Κατεψυγμένο 750g","Κατεψυγμένο Καλαμπόκι","kg",.5)
 ];
 // Incorrect label-to-metadata evidence for the same family blocks it.
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds),[["h1","h2"]]);
 assert.deepEqual(deriveAutoPackagedTypeGroups(items.filter(x=>x.source_product_id!=="wrong")).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["c1","c2"],["h1","h2"]]);
});
test("corn flour, sliced Edam and plain profiterole each retain a precise comparison family",()=>{
 const items=[
  p("co1","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ Κορν Φλάουρ 200γρ","Κορν Φλάουερ","kg",.2),
  p("co2","ΜΥΛΟΙ ΑΓΙΟΥ ΓΕΩΡΓΙΟΥ","ΜΥΛΟΙ ΑΓΙΟΥ ΓΕΩΡΓΙΟΥ Κορν Φλάουρ 200g","Κορν Φλάουερ","kg",.2),
  p("ed1","MR GRAND","MR GRAND Edam Σε Φέτες 200gr","Ένταμ","kg",.2),
  p("ed2","PALADIN","PALADIN Edam σε Φέτες 500g","Ένταμ","kg",.5),
  p("pr1","GLYKAKI","GLYKAKI Προφιτερόλ 200g","Γλυκίσματα Ψυγείου","kg",.2),
  p("pr2","CONFISERIE FIRENZE","CONFISERIE FIRENZE Προφιτερόλ 180g","Γλυκίσματα Ψυγείου","kg",.18),
  p("prOther","OTHER","OTHER Προφιτερόλ Χωρίς Ζάχαρη 200g","Γλυκίσματα Ψυγείου","kg",.2)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["co1","co2"],["ed1","ed2"],["pr1","pr2"]]);
});
test("six-pack sparkling water, citrus nectar and exact branded grapefruit mixers use verified whole packs",()=>{
 const items=[
  p("w1","AQUA CARPATICA","AQUA CARPATICA Ανθρακούχο Νερό 6x500ml","Ανθρακούχο Νερο","l",3),
  p("w2","ΜΙΤΣΙΚΕΛΙ","ΜΙΤΣΙΚΕΛΙ Ανθρακούχο Νερό 6x500ml","Ανθρακούχο Νερο","l",3),
  p("ju1","EVIVA","EVIVA Νέκταρ Πορτοκάλι 1l","Χυμός Πορτοκάλι","l",1),
  p("ju2","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Νέκταρ Πορτοκάλι 1lt","Χυμός Πορτοκάλι","l",1),
  p("mi1","ΒΙΚΟΣ","ΒΙΚΟΣ Mixer Pink Grapefruit 6x330ml","Άλλα Αναψυκτικά","l",1.98),
  p("mi2","SCHWEPPES","SCHWEPPES Mixer Pink Grapefruit 6x330ml","Άλλα Αναψυκτικά","l",1.98),
  p("different","OTHER","OTHER Mixer Pink Grapefruit Zero 6x330ml","Άλλα Αναψυκτικά","l",1.98)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["ju1","ju2"],["mi1","mi2"],["w1","w2"]]);
});
test("instant cappuccino and lemon iced tea cannot match incompatible preparation or flavours",()=>{
 const items=[
  p("cap1","JACOBS","JACOBS Στιγμιαίο Ρόφημα Cappuccino 290g","Καφές Καπουτσίνο","kg",.29),
  p("cap2","NESCAFE","NESCAFE Στιγμιαίο Ρόφημα Cappuccino 250g","Καφές Καπουτσίνο","kg",.25),
  p("capCold","HELL","HELL Ice Coffee Cappuccino 250ml","Καφές Καπουτσίνο","l",.25),
  p("tea1","XIXO","XIXO Κρύο Τσάι Λεμόνι 250ml","Παγωμένο Τσάι","l",.25),
  p("tea2","LIPTON","LIPTON Κρύο Τσάι Λεμόνι 250ml","Παγωμένο Τσάι","l",.25),
  p("teaPeach","OTHER","OTHER Κρύο Τσάι Ροδάκινο 250ml","Παγωμένο Τσάι","l",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["cap1","cap2"],["tea1","tea2"]]);
});

test("dated source: plain lavender-scent cat litter never matches another fragrance",()=>{
 const v=[
 p("c1","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ Άμμος Υγιεινής Γάτας Λεβάντα 5kg","Γάτα","kg",5),
 p("c2","ECONOMY","ECONOMY Γάτας Άμμος Υγιεινής Λεβάντα 5kg","Γάτα","kg",5),
 p("cOther","OTHER","OTHER Άμμος Υγιεινής Γάτας Χαμομήλι 5kg","Γάτα","kg",5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds),[["c1","c2"]]);
});
test("dated source: chocolate dairy cream stays separate from caramel and vanilla",()=>{
 const v=[
 p("ch1","ΣΤΑΜΟΥ","ΣΤΑΜΟΥ Κρέμα Σοκολάτα 180g","Επιδόρπιο Κρέμας","kg",.18),
 p("ch2","ΡΟΔΟΠΗ","ΡΟΔΟΠΗ Κρέμα Σοκολάτα 160g","Επιδόρπιο Κρέμας","kg",.16),
 p("van","OTHER","OTHER Κρέμα Βανίλια 180g","Επιδόρπιο Κρέμας","kg",.18)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds),[["ch1","ch2"]]);
});
test("dated source: only explicitly named full-fat long-life milk shares its exact source family",()=>{
 const v=[
 p("m1","ROYAL","ROYAL Γάλα Μακράς Διάρκειας Πλήρες 1lt","Γάλα Υψηλής Παστερίωσης","l",1),
 p("m2","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ","ΜΙΚΡΕΣ ΦΑΡΜΕΣ ΤΟΥ ΒΟΥΝΟΥ Γάλα Μακράς Διάρκειας Πλήρες 1l","Γάλα Υψηλής Παστερίωσης","l",1),
 p("light","OTHER","OTHER Γάλα Μακράς Διάρκειας Ελαφρύ 1lt","Γάλα Υψηλής Παστερίωσης","l",1),
 p("short","OTHER2","OTHER2 Φρέσκο Γάλα Πλήρες 1lt","Γάλα Υψηλής Παστερίωσης","l",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds),[["m1","m2"]]);
});
test("dated source: diced tomatoes with reversed Greek token order are one type, never passata",()=>{
 const v=[
 p("t1","BARESA","BARESA Ψιλοκομμένες Τομάτες 400g","Σάλτσα από Αποφλοιωμένες Ντομάτες","kg",.4),
 p("t2","GUSTONA","GUSTONA Τομάτα Ψιλοκομμένη 400g","Σάλτσα από Αποφλοιωμένες Ντομάτες","kg",.4),
 p("t3","ΓΚΡΕΚΑ","ΓΚΡΕΚΑ Τομάτες Ψιλοκομμένες 400g","Σάλτσα από Αποφλοιωμένες Ντομάτες","kg",.4),
 p("passata","OTHER","OTHER Τομάτα Passata 400g","Σάλτσα από Αποφλοιωμένες Ντομάτες","kg",.4)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds),[["t1","t2","t3"]]);
});
test("dated source: plain kefir and gazosa families remain independently typed by category",()=>{
 const v=[
 p("k1","ΣΤΑΜΟΥ","ΣΤΑΜΟΥ Κεφίρ 330ml","Κεφίρ","l",.33),
 p("k2","ΕΒΡΟΦΑΡΜΑ","ΕΒΡΟΦΑΡΜΑ Κεφίρ 500ml","Κεφίρ","l",.5),
 p("k3","OTHER","OTHER Κεφίρ Χωρίς Λακτόζη 330ml","Κεφίρ","l",.33),
 p("g1","ΓΕΡΑΝΙ","ΓΕΡΑΝΙ Γκαζόζα 1,5lt","Γκαζόζα","l",1.5),
 p("g2","7UP","7UP Γκαζόζα 1,5lt","Γκαζόζα","l",1.5),
 p("g-zero","OTHER","OTHER Γκαζόζα Zero 1,5lt","Γκαζόζα","l",1.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["g1","g2"],["k1","k2"]]);
});

test("Oct17 frozen broccoli, bulgur and sliced mushrooms match only the named type",()=>{
 const v=[
 p("b1","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ Μπρόκολο 750g","Κατεψυγμένο Μπρόκολο","kg",.75),
 p("b2","ΑΙΝΟΣ","ΑΙΝΟΣ Μπρόκολο 750g","Κατεψυγμένο Μπρόκολο","kg",.75),
 p("bu1","MR GRAND","MR GRAND Πλιγούρι 500gr","Πλιγούρι","kg",.5),
 p("bu2","FYTRO","FYTRO Πλιγούρι 500g","Πλιγούρι","kg",.5),
 p("m1","ARDO","ARDO Μανιτάρια σε Φέτες 350g","Κατεψυγμένα Μανιτάρια","kg",.35),
 p("m2","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ","ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ Μανιτάρια σε φέτες 450g","Κατεψυγμένα Μανιτάρια","kg",.45),
 p("whole","OTHER","OTHER Μανιτάρια Ολόκληρα 450g","Κατεψυγμένα Μανιτάρια","kg",.45)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["b1","b2"],["bu1","bu2"],["m1","m2"]]);
});
test("Oct17 wafer, dark-chocolate granola, milk candy and PDO graviera keep exact subtypes",()=>{
 const v=[
 p("w1","LACTA","LACTA Γκοφρέτα Σοκολάτα Γάλακτος 28.5gr","Γκοφρέτες με Σοκολάτα Γάλακτος","kg",.0285),
 p("w2","BONORA","BONORA Γκοφρέτα με Σοκολάτα Γάλακτος 33g","Γκοφρέτες με Σοκολάτα Γάλακτος","kg",.033),
 p("wWhite","OTHER","OTHER Γκοφρέτα Λευκή Σοκολάτα 33g","Γκοφρέτες με Σοκολάτα Γάλακτος","kg",.033),
 p("g1","NUTRI VALLEY","NUTRI VALLEY Δημητριακά Granola με Μαύρη Σοκολάτα 320g","Γκρανόλα","kg",.32),
 p("g2","MR GRAND","MR GRAND Granola Δημητριακά Με Μαύρη Σοκολάτα 375γρ","Γκρανόλα","kg",.375),
 p("c1","ΛΑΒΔΑΣ","ΛΑΒΔΑΣ Καραμέλες Γάλακτος 300g","Καραμέλες","kg",.3),
 p("c2","ΑΒ","ΑΒ Καραμέλες Γάλακτος 250γρ","Καραμέλες","kg",.25),
 p("ch1","ΝΩΜΑ","ΝΩΜΑ Γραβιέρα Κρήτης Π.Ο.Π. 350g","Γραβιέρα","kg",.35),
 p("ch2","ΓΑΛΠΟ","ΓΑΛΠΟ Γραβιέρα Κρήτης Π.Ο.Π. 400g","Γραβιέρα","kg",.4),
 p("chDiff","OTHER","OTHER Γραβιέρα Νάξου Π.Ο.Π. 400g","Γραβιέρα","kg",.4)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["c1","c2"],["ch1","ch2"],["g1","g2"],["w1","w2"]]);
});
test("single-word spinach-rice matches only exact unprepared family and corroborated packs",()=>{
 const v=[
 p("s1","ΑΙΝΟΣ","ΑΙΝΟΣ Σπανακόρυζο 1kg","Γεύματα","kg",1),
 p("s2","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Σπανακόρυζο 1kg","Γεύματα","kg",1),
 p("ready","OTHER","OTHER Σπανακόρυζο Έτοιμο 1kg","Γεύματα","kg",1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(v).map(x=>x.memberIds),[["s1","s2"]]);
 assert.deepEqual(deriveAutoPackagedTypeGroups([...v.slice(0,2),
  p("contradiction","OTHER","OTHER Σπανακόρυζο 1kg","Γεύματα","kg",.5)]),[]);
});

test("October 17: Honey Rings are a named cereal family, not Choco Balls or other children's cereals",()=>{
 const xs=[
  p("h1","ECONOMY","ECONOMY Δημητριακά Honey Rings 375γρ","Παιδικά Δημητριακά","kg",.375),
  p("h2","BONORA","BONORA Δημητριακά Honey Rings 375g","Παιδικά Δημητριακά","kg",.375),
  p("choco","OTHER","OTHER Δημητριακά Choco Balls 375g","Παιδικά Δημητριακά","kg",.375),
  p("sugar-free","BETA","BETA Δημητριακά Honey Rings Χωρίς Ζάχαρη 375g","Παιδικά Δημητριακά","kg",.375)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(xs).map(g=>g.memberIds),[["h1","h2"]]);
});
test("October 17: village-style wholegrain rusks stay separate from non-wholegrain and other bread types",()=>{
 const xs=[
  p("r1","ΑΒ ΕΠΙΛΟΓΗ","ΑΒ ΕΠΙΛΟΓΗ Φρυγανιές Χωριάτικες Ολικής Άλεσης 240g","Φρυγανιές","kg",.24),
  p("r2","ΒΟΣΙΝΑΚΗ","ΒΟΣΙΝΑΚΗ Φρυγανιές Χωριάτικες Ολικής Άλεσης 240g","Φρυγανιές","kg",.24),
  p("rOther","OTHER","OTHER Φρυγανιές Χωριάτικες 240g","Φρυγανιές","kg",.24),
  p("rOrganic","BIO BRAND","BIO BRAND Φρυγανιές Χωριάτικες Βιολογικές Ολικής Άλεσης 240g","Φρυγανιές","kg",.24)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(xs).map(g=>g.memberIds),[["r1","r2"]]);
});
test("October 17: explicitly noncarbonated orangeade compares only within the same fizz variant",()=>{
 const xs=[
  p("o1","ΛΟΥΞ","ΛΟΥΞ Πορτοκαλάδα Χωρίς Ανθρακικό 330ml","Πορτοκαλάδες","l",.33),
  p("o2","ΚΛΙΑΦΑ","ΚΛΙΑΦΑ Πορτοκαλάδα Χωρίς Ανθρακικό 1.5lt","Πορτοκαλάδες","l",1.5),
  p("with-bubbles","OTHER","OTHER Πορτοκαλάδα 1.5lt","Πορτοκαλάδες","l",1.5),
  p("no-sugar","OTHER2","OTHER2 Πορτοκαλάδα Χωρίς Ανθρακικό Χωρίς Ζάχαρη 330ml","Πορτοκαλάδες","l",.33)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(xs).map(g=>g.memberIds),[["o1","o2"]]);
});
test("October 17: wholegrain medium orzo and No10 spaghettini retain pasta shape and size",()=>{
 const xs=[
  p("or1","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Κριθαράκι Μέτριο Ολικής Άλεσης 500g","Κριθαράκι","kg",.5),
  p("or2","MELISSA","MELISSA Κριθαράκι Μέτριο Ολικής Αλέσης 500g","Κριθαράκι","kg",.5),
  p("orFine","OTHER","OTHER Κριθαράκι Ψιλό Ολικής Άλεσης 500g","Κριθαράκι","kg",.5),
  p("sp1","WORLD'S MARKET","WORLD'S MARKET Σπαγγετίνη Νο10 Ολικής Άλεσης 500g","Σπαγγέτι","kg",.5),
  p("sp2","MELISSA","MELISSA Σπαγγετίνη Ολικής Άλεσης Νο10 500gr","Σπαγγέτι","kg",.5),
  p("sp5","OTHER2","OTHER2 Σπαγγετίνη Ολικής Άλεσης Νο5 500g","Σπαγγέτι","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(xs).map(g=>g.memberIds).sort((a,b)=>a[0].localeCompare(b[0])),[["or1","or2"],["sp1","sp2"]]);
});
test("wholegrain and without-carbonation allowances cannot waive unrelated specialty or dietary claims",()=>{
 const xs=[
  p("a","A","A Λεμονάδα Χωρίς Ανθρακικό 1lt","Λεμονάδες","l",1),
  p("b","B","B Λεμονάδα Χωρίς Ανθρακικό 1lt","Λεμονάδες","l",1),
  p("c","C","C Πορτοκαλάδα Χωρίς Ανθρακικό Zero 1lt","Πορτοκαλάδες","l",1),
  p("d","D","D Πορτοκαλάδα Χωρίς Ανθρακικό Zero 1lt","Πορτοκαλάδες","l",1),
  p("e","E","E Φρυγανιές Χωριάτικες Ολικής Άλεσης Vegan 240g","Φρυγανιές","kg",.24),
  p("f","F","F Φρυγανιές Χωριάτικες Ολικής Άλεσης Vegan 240g","Φρυγανιές","kg",.24)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(xs),[]);
});

test("unaudited wholegrain variants cannot inherit the exact audited wholegrain waiver",()=>{
 const xs=[
  p("rA","A","A Φρυγανιές Σταρένιες Ολικής Άλεσης 240g","Φρυγανιές","kg",.24),
  p("rB","B","B Φρυγανιές Σταρένιες Ολικής Άλεσης 240g","Φρυγανιές","kg",.24),
  p("oA","A","A Κριθαράκι Ψιλό Ολικής Άλεσης 500g","Κριθαράκι","kg",.5),
  p("oB","B","B Κριθαράκι Ψιλό Ολικής Άλεσης 500g","Κριθαράκι","kg",.5),
  p("spA","A","A Σπαγγετίνη Νο5 Ολικής Άλεσης 500g","Σπαγγέτι","kg",.5),
  p("spB","B","B Σπαγγετίνη Νο5 Ολικής Άλεσης 500g","Σπαγγέτι","kg",.5),
  p("spOtherA","A","A Σπαγγέτι Νο10 Ολικής Άλεσης 500g","Σπαγγέτι","kg",.5),
  p("spOtherB","B","B Σπαγγέτι Νο10 Ολικής Άλεσης 500g","Σπαγγέτι","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(xs),[]);
});


test("October 17: chicken-turkey wet cat food matches only exactly labelled ordinary canned type",()=>{
 const items=[
 p("cat1","MY FRIENDS","MY FRIENDS Κονσέρβα Γάτας με Κοτόπουλο & Γαλοπούλα 400g","Υγρή Τροφή για Γάτες","kg",.4),
 p("cat2","BEST PRICE","BEST PRICE Κονσέρβα Γάτας Κοτόπουλο-Γαλοπούλα 405g","Υγρή Τροφή για Γάτες","kg",.405),
 p("cat3","OTHER","OTHER Κονσέρβα Γάτας με Κοτόπουλο & Μοσχάρι 400g","Υγρή Τροφή για Γάτες","kg",.4),
 p("cat4","BETA","BETA Κονσέρβα Γάτας με Κοτόπουλο & Γαλοπούλα Vegan 400g","Υγρή Τροφή για Γάτες","kg",.4)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds),[["cat1","cat2"]]);
});
test("October 17: regular wet dog chicken-turkey cans remain separate from other meats and diets",()=>{
 const items=[
 p("dog1","BEST PRICE","BEST PRICE Κονσέρβα Σκύλου Κοτόπουλο & Γαλοπούλα 1250g","Υγρή Τροφή για Σκύλους","kg",1.25),
 p("dog2","MY FRIENDS","MY FRIENDS Κονσέρβα Σκύλου με Κοτόπουλο & Γαλοπούλα 400g","Υγρή Τροφή για Σκύλους","kg",.4),
 p("dog3","OTHER","OTHER Κονσέρβα Σκύλου με Κοτόπουλο & Μοσχάρι 400g","Υγρή Τροφή για Σκύλους","kg",.4),
 p("dog4","BETA","BETA Κονσέρβα Σκύλου με Κοτόπουλο & Γαλοπούλα Υποαλλεργική 400g","Υγρή Τροφή για Σκύλους","kg",.4)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds),[["dog1","dog2"]]);
});
test("October 17: sausage puff-pastry bites are distinct from cheese pies and vegan specialty pastries",()=>{
 const items=[
 p("pie1","ΑΒ ΕΠΙΛΟΓΗ","ΑΒ ΕΠΙΛΟΓΗ Λουκανικοπιτάκια Σφολιάτας 1kg","Πίτες και Πιτάκια","kg",1),
 p("pie2","ΧΡΥΣΗ ΖΥΜΗ","ΧΡΥΣΗ ΖΥΜΗ Λουκανικοπιτάκια Σφολιάτας 800g","Πίτες και Πιτάκια","kg",.8),
 p("pie3","OTHER","OTHER Τυροπιτάκια Σφολιάτας 800g","Πίτες και Πιτάκια","kg",.8),
 p("pie4","OTHER2","OTHER2 Λουκανικοπιτάκια Σφολιάτας Vegan 800g","Πίτες και Πιτάκια","kg",.8)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds),[["pie1","pie2"]]);
});
test("October 17: chocolate drink powder is never conflated with instant cocoa powder",()=>{
 const items=[
 p("c1","CADBURY'S","CADBURY'S Ρόφημα Σοκολάτας 500g","Σοκολάτα - Κακάο","kg",.5),
 p("c2","MARCHOC","MARCHOC Ρόφημα Σοκολάτας 400g","Σοκολάτα - Κακάο","kg",.4),
 p("c3","MR GRAND","MR GRAND Ρόφημα Σοκολάτας 250γρ","Σοκολάτα - Κακάο","kg",.25),
 p("c4","OTHER","OTHER Ρόφημα Στιγμής Κακάο 400g","Σοκολάτα - Κακάο","kg",.4),
 p("c5","OTHER2","OTHER2 Ρόφημα Σοκολάτας Zero 500g","Σοκολάτα - Κακάο","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds),[["c1","c2","c3"]]);
});
test("October 17: explicitly plant-based pastry cream matches only its own named preparation type",()=>{
 const items=[
 p("v1","MY DAY","MY DAY Φυτική Κρέμα Ζαχαροπλαστικής 1l","Κρέμα Γάλακτος","l",1),
 p("v2","ROYAL","ROYAL Φυτική Κρέμα Ζαχαροπλαστικής 500ml","Κρέμα Γάλακτος","l",.5),
 p("v3","MR GRAND","MR GRAND Φυτική Κρέμα Ζαχαροπλαστικής 500ml","Κρέμα Γάλακτος","l",.5),
 p("d1","OTHER","OTHER Κρέμα Γάλακτος 500ml","Κρέμα Γάλακτος","l",.5),
 p("v4","OTHER2","OTHER2 Φυτική Κρέμα Ζαχαροπλαστικής Vegan 500ml","Κρέμα Γάλακτος","l",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(x=>x.memberIds),[["v1","v2","v3"]]);
});
test("new October 17 product kinds still veto contradictory or ambiguous whole-package labels",()=>{
 const items=[
 p("cat1","A","A Κονσέρβα Γάτας με Κοτόπουλο & Γαλοπούλα 400g","Υγρή Τροφή για Γάτες","kg",.4),
 p("cat2","B","B Κονσέρβα Γάτας με Κοτόπουλο & Γαλοπούλα 400g","Υγρή Τροφή για Γάτες","kg",.2),
 p("c1","C","C Ρόφημα Σοκολάτας 250g","Σοκολάτα - Κακάο","kg",.25),
 p("c2","D","D Ρόφημα Σοκολάτας 250g","Σοκολάτα - Κακάο","l",.25)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items),[]);
});

test("Oct 18 source: exact short-cut pasta matches brands but never a different cut or gluten-free",()=>{
 const items=[
  p("k1","MISKO","MISKO Κοφτό 500g","Kοφτό Mακαρόνι","kg",.5),
  p("k2","MELISSA","MELISSA Κοφτό 500gr","Kοφτό Mακαρόνι","kg",.5),
  p("k3","ΜΑΡΑΤΑ","ΜΑΡΑΤΑ Κοφτό 500g","Kοφτό Mακαρόνι","kg",.5),
  p("otherCut","OTHER","OTHER Κοφτό Μέτριο 500g","Kοφτό Mακαρόνι","kg",.5),
  p("gf","OTHER2","OTHER2 Κοφτό Χωρίς Γλουτένη 500g","Kοφτό Mακαρόνι","kg",.5)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(g=>g.memberIds),[["k1","k2","k3"]]);
});
test("Oct 18 source: ordinary wet cat chicken pate does not merge with beef, jelly or veterinary diet",()=>{
 const items=[
  p("c1","WHISKAS","WHISKAS Υγρή Τροφή Γάτας με Κοτόπουλο σε Πατέ 400g","Υγρή Τροφή για Γάτες","kg",.4),
  p("c2","BARRON","BARRON Υγρή Τροφή Γάτας Πατέ με Κοτόπουλο 100g","Υγρή Τροφή για Γάτες","kg",.1),
  p("cBeef","OTHER","OTHER Υγρή Τροφή Γάτας Πατέ με Μοσχάρι 100g","Υγρή Τροφή για Γάτες","kg",.1),
  p("cJelly","OTHER2","OTHER2 Υγρή Τροφή Γάτας Κοτόπουλο σε Ζελέ 100g","Υγρή Τροφή για Γάτες","kg",.1),
  p("cDiet","OTHER3","OTHER3 Υγρή Τροφή Γάτας Πατέ με Κοτόπουλο Diet 100g","Υγρή Τροφή για Γάτες","kg",.1)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(g=>g.memberIds),[["c1","c2"]]);
});
test("Oct 18 source: Men Sensitive shaving foam has a narrow format and variant",()=>{
 const items=[
  p("s1","NOXZEMA","NOXZEMA Men Αφρός Ξυρίσματος Sensitive 300ml","Αφροί και Τζελ","l",.3),
  p("s2","GLOW & BEAUTY","GLOW & BEAUTY Αφρός Ξυρίσματος Men Sensitive 200ml","Αφροί και Τζελ","l",.2),
  p("s3","NIVEA","NIVEA Men Αφρός Ξυρίσματος Sensitive 200ml","Αφροί και Τζελ","l",.2),
  p("gel","OTHER","OTHER Men Τζελ Ξυρίσματος Sensitive 200ml","Αφροί και Τζελ","l",.2),
  p("regular","OTHER2","OTHER2 Men Αφρός Ξυρίσματος 200ml","Αφροί και Τζελ","l",.2)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(g=>g.memberIds),[["s1","s2","s3"]]);
});
test("Oct 18 source: White Musk body wash preserves scent and form",()=>{
 const items=[
  p("w1","GLOW & BEAUTY","GLOW & BEAUTY Αφρόλουτρο White Musk 500ml","Αφρόλουτρα","l",.5),
  p("w2","CIEN","CIEN Αφρόλουτρο White Musk 650ml","Αφρόλουτρα","l",.65),
  p("other","OTHER","OTHER Αφρόλουτρο Vanilla Musk 650ml","Αφρόλουτρα","l",.65),
  p("shampoo","OTHER2","OTHER2 Σαμπουάν White Musk 650ml","Αφρόλουτρα","l",.65),
  p("organic","OTHER3","OTHER3 Αφρόλουτρο White Musk Organic 650ml","Αφρόλουτρα","l",.65)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items).map(g=>g.memberIds),[["w1","w2"]]);
});
test("Oct 18 source: new skincare or pet categories still veto falsely described whole packs",()=>{
 const items=[
  p("s1","A","A Men Αφρός Ξυρίσματος Sensitive 200ml","Αφροί και Τζελ","l",.2),
  p("s2","B","B Men Αφρός Ξυρίσματος Sensitive 200ml","Αφροί και Τζελ","l",.25),
  p("w1","A","A Αφρόλουτρο White Musk 500ml","Αφρόλουτρα","l",.5),
  p("w2","B","B Αφρόλουτρο White Musk 500ml","Αφρόλουτρα","kg",.5),
  p("c1","A","A Υγρή Τροφή Γάτας Πατέ με Κοτόπουλο 100g","Υγρή Τροφή για Γάτες","kg",.1),
  p("c2","B","B Υγρή Τροφή Γάτας Πατέ με Κοτόπουλο 100g","Υγρή Τροφή για Γάτες","kg",.2)
 ];
 assert.deepEqual(deriveAutoPackagedTypeGroups(items),[]);
});

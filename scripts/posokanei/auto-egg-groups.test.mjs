import test from "node:test";
import assert from "node:assert/strict";
import {deriveAutoEggGroups} from "./auto-egg-groups.mjs";
import {findBrandAlternatives} from "./brand-alternatives.mjs";

const p=(id,brand,name,count=10)=>({
  source_product_id:id,brand,name,category:"Αυγά",unit:"piece",unit_quantity:count
});
const eggs=[
 p("egg-a","ΑΒ ΕΠΙΛΟΓΗ","ΑΒ ΕΠΙΛΟΓΗ Αυγά Αχυρώνα Large 10 Τεμάχια 63/73g"),
 p("egg-b","MY KOUZINA","MY KOUZINA Αυγά Αχυρώνα 10 Τεμάχια Large 63-73g"),
 p("egg-m","ΓΑΛΑΞΙΑΣ","ΓΑΛΑΞΙΑΣ Αυγά Αχυρώνα Medium 10 Τεμάχια 53-63g"),
 p("egg-free","FARMER","FARMER Αυγά Ελευθέρας Βοσκής Large 10 Τεμάχια 63/73g")
];
test("egg products need matching rearing method and size class",()=>{
 const groups=deriveAutoEggGroups(eggs);
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0].memberIds,["egg-a","egg-b"]);
 assert.equal(groups[0].basis,"piece");
 assert.equal(groups[0].approvalMethod,"automatic_commodity");
});
test("egg pack count must be explicitly corroborated with source unit",()=>{
 const mismatch=p("egg-bad","BETA","BETA Αυγά Αχυρώνα Large 6 Τεμάχια 63-73g",10);
 assert.deepEqual(deriveAutoEggGroups([eggs[0],mismatch]),[]);
 const valid=p("egg-c","BETA","BETA Αυγά Αχυρώνα Large 6 Τεμάχια 63-73g",6);
 assert.equal(deriveAutoEggGroups([eggs[0],valid]).length,1);
});
test("no autoapproval for ambiguous egg labels, mixed source classifications or duplicates",()=>{
 const noHousing=p("no-housing","BETA","BETA Αυγά Large 10 Τεμάχια 63-73g");
 const ungraded=p("ungraded","BETA","BETA Αυγά Αχυρώνα 10 Τεμάχια");
 const diet=p("diet","BETA","BETA Αυγά Αχυρώνα Large Omega 10 Τεμάχια 63-73g");
 assert.deepEqual(deriveAutoEggGroups([eggs[0],noHousing]),[]);
 assert.deepEqual(deriveAutoEggGroups([eggs[0],ungraded]),[]);
 assert.deepEqual(deriveAutoEggGroups([eggs[0],diet]),[]);
 assert.deepEqual(deriveAutoEggGroups([eggs[0],eggs[0],eggs[1]]),[]);
});
test("existing individually reviewed groups take precedence",()=>{
 const reviewed=[{status:"approved",memberIds:["egg-a","egg-b"]}];
 assert.deepEqual(deriveAutoEggGroups(eggs,reviewed),[]);
});
test("approved egg comparisons preserve whole-carton rounding and user opt-in",()=>{
 const prices=new Map([["egg-a",[{price_eur:3,retailer_id:"a"}]],["egg-b",[{price_eur:2.75,retailer_id:"b"}]]]);
 const groups=deriveAutoEggGroups(eggs);
 const match=findBrandAlternatives({sourceId:"egg-a",packages:2,products:eggs,offersByProduct:prices,approvedGroups:groups});
 assert.deepEqual(match.alternatives.map(x=>x.id),["egg-b"]);
 assert.equal(match.alternatives[0].packageCount,2);
 assert.equal(match.alternatives[0].savingsEur,.5);
 assert.equal(match.alternatives[0].approvalMethod,"automatic_commodity");
});

test("conflicting numerical and textual egg grades fail closed even when brands agree",()=>{
 const bad=[
  p("contra-a","ALFA","ALFA Αυγά Αχυρώνα Medium 10 Τεμάχια 63-73g"),
  p("contra-b","BETA","BETA Αυγά Αχυρώνα Medium 10 Τεμάχια 63-73g")
 ];
 assert.deepEqual(deriveAutoEggGroups(bad),[]);
 const mix=p("contra-mix","GAMMA","GAMMA Αυγά Αχυρώνα Large 10 Τεμάχια 53-63g");
 assert.deepEqual(deriveAutoEggGroups([eggs[0],mix]),[]);
});
test("XL grade is recognized before L, including extra-large with matching numeric evidence",()=>{
 const xl=[
  p("xl-a","ALFA","ALFA Αυγά Αχυρώνα Extra Large 10 Τεμάχια 73-83g"),
  p("xl-b","BETA","BETA Αυγά Αχυρώνα XL 10 Τεμάχια 73/83g")
 ];
 assert.equal(deriveAutoEggGroups(xl).length,0); // distinct complete descriptions don't share a family
 assert.deepEqual(deriveAutoEggGroups([
  p("x1","A","A Αυγά Αχυρώνα Extra Large 10 Τεμάχια 73-83g"),
  p("x2","B","B Αυγά Αχυρώνα Extra Large 6 Τεμάχια 73-83g",6)
 ]).map(g=>g.label),["Αυγά barn XL"]);
 assert.deepEqual(deriveAutoEggGroups([
  p("x3","A","A Αυγά Αχυρώνα Extra Large 10 Τεμάχια 63-73g"),
  p("x4","B","B Αυγά Αχυρώνα Extra Large 10 Τεμάχια 63-73g")
 ]),[]);
});
test("Greek gram labels disagreeing with written grade are rejected",()=>{
 const okay=[
  p("gr-a","ALFA","ALFA Αυγά Αχυρώνα Μεσαία 10 Τεμάχια 53-63γρ"),
  p("gr-b","BETA","BETA Αυγά Αχυρώνα Μεσαία 10 Τεμάχια 53-63γρ")
 ];
 assert.equal(deriveAutoEggGroups(okay).length,1);
 const wrong=p("gr-wrong","BETA","BETA Αυγά Αχυρώνα Μεσαία 10 Τεμάχια 63-73γρ");
 assert.deepEqual(deriveAutoEggGroups([okay[0],wrong]),[]);
});

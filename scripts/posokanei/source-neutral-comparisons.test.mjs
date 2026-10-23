import test from "node:test";
import assert from "node:assert/strict";
import {discoverSourceNeutralCandidates,compareSearchTokens} from "./source-neutral-comparisons.mjs";
const lidl={id:"lidl_gr_GR0851_a",origin:"lidl_gr",name:"Γιαούρτι στραγγιστό 5%",brand:"Galpo",quantity:null,unit:null};
const gov={id:"gov001",origin:"posokanei",name:"Γιαούρτι στραγγιστό 2%",brand:"ΔΕΛΤΑ",priceEur:1.9,quantity:0.2,unit:"kg"};
test("source-independent candidate discovery finds other brand, not approved",()=>{const r=discoverSourceNeutralCandidates({source:lidl,candidates:[gov]});assert.equal(r[0].origin,"posokanei");assert.equal(r[0].confidence,"requires_review");assert.equal(r[0].differentBrand,true);assert.equal(r[0].priceComparisonAvailable,false)});
test("Lidl to Lidl comparison not automatically approved",()=>{const r=discoverSourceNeutralCandidates({source:lidl,candidates:[{...lidl,id:"second",brand:"Other"}]});assert.equal(r[0].confidence,"requires_review")});
test("government reviewed group can be approved",()=>{const a={...gov,id:"g1"},b={...gov,id:"g2",brand:"Other"};const r=discoverSourceNeutralCandidates({source:a,candidates:[b],approvedGroups:[{status:"approved",memberIds:["g1","g2"]}]});assert.equal(r[0].confidence,"reviewed_equivalent");assert.equal(r[0].priceComparisonAvailable,true)});
test("unrelated cosmetics not grouped",()=>assert.equal(discoverSourceNeutralCandidates({source:lidl,candidates:[{...gov,name:"Σαμπουάν βρεφικό"}]}).length,0));
test("price alone never implies match",()=>assert.equal(discoverSourceNeutralCandidates({source:{...lidl,name:"Ακτινίδια"},candidates:[gov]}).length,0));
test("Greek accents folded",()=>assert.deepEqual(compareSearchTokens("Γιαούρτι 200g"),["γιαουρτι","200g"]));

test("large government catalogue cannot crowd matching Lidl products out of capped groups",()=>{
  const source={id:"gov0",origin:"posokanei",name:"Γιαούρτι στραγγιστό 5% 1kg",brand:"Brand",unit:"kg",quantity:1};
  const government=Array.from({length:25},(_,i)=>({id:"gov"+(i+1),origin:"posokanei",name:"Γιαούρτι στραγγιστό 5% 1kg",brand:"Other"}));
  const lidlOffer={id:"lidl_gr:GR0851:8bd5bd46-14f1-47c6-a37c-d4a13648fd3a",origin:"lidl_gr",name:"Γιαούρτι στραγγιστό 5%",brand:"Galpo",storeKey:"GR0851"};
  const matches=discoverSourceNeutralCandidates({source,candidates:[...government,lidlOffer],limit:10});
  assert.equal(matches.length,10);
  assert.equal(matches.filter(x=>x.origin==="lidl_gr").length,1);
  assert.equal(matches.find(x=>x.origin==="lidl_gr").confidence,"requires_review");
});

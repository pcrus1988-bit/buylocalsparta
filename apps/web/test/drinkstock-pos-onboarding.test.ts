import assert from "node:assert/strict";
import test from "node:test";
import {
 parsePosMenuCsv,proposeExactMatches,buildMappingCsv,posCsvTemplate,
 posSetupPath,buildVendorRequest,PosOnboardingError,normalizedDrinkName
} from "../src/lib/drinkstock-pos-onboarding.ts";

test("Greek vendor paths default to the least-privilege setup route",()=>{
 assert.equal(posSetupPath("documented_api_provisioning"),"cloud");
 assert.equal(posSetupPath("vendor_local_bridge"),"local_bridge");
 assert.equal(posSetupPath("vendor_bridge"),"vendor_assisted");
 assert.equal(posSetupPath("vendor_web_services"),"vendor_assisted");
});
test("Greek semicolon CSV and Unicode labels work without server data",()=>{
 const csv='Κωδικός;Περιγραφή;Τιμή\r\n"B-01";"Μπύρα, βαρέλι";"5,50"\r\n"C-02";"Mojito";"8,50"\r\n';
 assert.deepEqual(parsePosMenuCsv(csv),[
  {externalItemId:"B-01",name:"Μπύρα, βαρέλι"},
  {externalItemId:"C-02",name:"Mojito"}
 ]);
});
test("Quoted delimiters and embedded escaped quotes parse reliably",()=>{
 const csv='code,name\n"SKU;1","Mojito ""Fresh"", small"\n';
 assert.deepEqual(parsePosMenuCsv(csv),[{externalItemId:"SKU;1",name:'Mojito "Fresh", small'}]);
});
test("Invalid, too large, ambiguous and duplicate POS files fail closed",()=>{
 for(const input of [
  "name,price\nA,3",
  'code,name\nA,"Unclosed',
  'code,name\nA,Beer\nA,Beer',
  "code,name\n,Beer",
  "X".repeat(512001)
 ]){
  assert.throws(()=>parsePosMenuCsv(input),PosOnboardingError);
 }
});
test("Exact Greek accent and whitespace normalization suggests, never certifies",()=>{
 assert.equal(normalizedDrinkName("ΜΠΎΡΑ  Βαρέλι"),normalizedDrinkName("μπυρα βαρελι"));
 const matches=proposeExactMatches([
  {externalItemId:"B",name:"ΜΠΎΡΑ βαρέλι"},
  {externalItemId:"M",name:"Mojitto"},
  {externalItemId:"D",name:"Duplicate"}
 ],[
  {id:"v1",name:"μπυρα ΒΑΡΕΛΙ"},
  {id:"v2",name:"Mojito"},
  {id:"v3",name:"Duplicate"},
  {id:"v4",name:"Duplicate"}
 ]);
 assert.deepEqual(matches,[
  {externalItemId:"B",productId:"v1"},
  {externalItemId:"M",productId:""},
  {externalItemId:"D",productId:""}
 ]);
});
test("Exports are review-only and escape formula injection in spreadsheet tools",()=>{
 const items=[{externalItemId:"-NEG",name:"=1+1"}];
 const csv=buildMappingCsv(items,[{externalItemId:"-NEG",productId:"v1"}],[{id:"v1",name:"@SUM(A1:A2)"}]);
 assert.ok(csv.includes('"\'-NEG"'));
 assert.ok(csv.includes('"\'=1+1"'));
 assert.ok(csv.includes('"\'@SUM(A1:A2)"'));
 assert.ok(csv.includes("TO_REVIEW"));
 assert.ok(!csv.includes("APPROVED"));
 const parsed=parsePosMenuCsv(posCsvTemplate());
 assert.equal(parsed.length,2);
});
test("Vendor request seeks supported interfaces, not credentials",()=>{
 const text=buildVendorRequest("Twinsoft OREXSYS","Pilot Bar","local_bridge");
 assert.ok(text.includes("Twinsoft OREXSYS"));
 assert.ok(text.includes("Pilot Bar"));
 assert.ok(text.includes("Windows/POS"));
 assert.ok(text.includes("Δεν ζητούμε κωδικούς"));
});

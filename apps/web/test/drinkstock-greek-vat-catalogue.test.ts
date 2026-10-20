import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 resolveGreekBeverageVat,splitGreekBeverageGross,VAT_LEGAL_SOURCES,VAT_RULE_VERSION
} from "../src/lib/drinkstock-greek-vat.ts";
import {
 DRINKSTOCK_STARTER_CATALOGUE,validateCatalogueSelections,catalogueTemplateByKey
} from "../src/lib/drinkstock-starter-catalogue.ts";
import {validateCatalogueImportCommand} from "../src/lib/drinkstock-catalogue-import-service.ts";

test("Greek hospitality 2026 national dine-in beverage VAT is 24% across categories",()=>{
 for(const vatClass of ["alcoholic","non_alcoholic","water"] as const)
  assert.equal(resolveGreekBeverageVat({vatClass,mode:"dine_in"}).rateBasisPoints,2400);
});
test("alcoholic drinks remain 24% on premises and as goods",()=>{
 for(const mode of ["dine_in","takeaway","delivery"] as const)
  assert.equal(resolveGreekBeverageVat({vatClass:"alcoholic",mode}).rateBasisPoints,2400);
});
test("non-alcoholic goods and ordinary water take 13%; service 24%",()=>{
 for(const vatClass of ["non_alcoholic","water"] as const)
  for(const mode of ["takeaway","delivery"] as const)
   assert.equal(resolveGreekBeverageVat({vatClass,mode}).rateBasisPoints,1300);
});
test("island reductions require a separately verified eligible business and transaction",()=>{
 assert.throws(()=>resolveGreekBeverageVat({vatClass:"water",mode:"takeaway",
  jurisdiction:"verified_island_reduced"}),/ISLAND_VAT_VERIFICATION_REQUIRED/);
 assert.equal(resolveGreekBeverageVat({vatClass:"alcoholic",mode:"dine_in",
  jurisdiction:"verified_island_reduced",islandEligibilityVerified:true}).rateBasisPoints,1700);
 assert.equal(resolveGreekBeverageVat({vatClass:"non_alcoholic",mode:"takeaway",
  jurisdiction:"verified_island_reduced",islandEligibilityVerified:true}).rateBasisPoints,900);
 assert.throws(()=>resolveGreekBeverageVat({vatClass:"review_required",mode:"dine_in"}),/VAT_CLASSIFICATION_REVIEW_REQUIRED/);
 assert.throws(()=>resolveGreekBeverageVat({vatClass:"non_alcoholic",mode:"foo" as never}),/INVALID_VAT_SERVICE_MODE/);
 assert.match(VAT_RULE_VERSION,/2026/);
 assert.equal(VAT_LEGAL_SOURCES.length,3);
});
test("integer euro-cent inclusive VAT splits reconcile, never invent cents",()=>{
 for(const basis of [900,1300,1700,2400] as const)
  for(const gross of [1,99,100,135,387,1000,12345]){
   const s=splitGreekBeverageGross(gross,basis);
   assert.equal(s.netCents+s.vatCents,gross);
   assert.ok(Number.isSafeInteger(s.vatCents)&&s.vatCents>=0);
   assert.equal(s.rateBasisPoints,basis);
  }
 assert.throws(()=>splitGreekBeverageGross(-1,2400),/INVALID_VAT_GROSS/);
 assert.throws(()=>splitGreekBeverageGross(12.3,2400),/INVALID_VAT_GROSS/);
});
test("curated venue catalogue has unique keys and products all valid for market limits",()=>{
 const list=DRINKSTOCK_STARTER_CATALOGUE;
 assert.ok(list.length>=50&&list.length<=60);
 assert.equal(new Set(list.map(x=>x.key)).size,list.length);
 assert.equal(new Set(list.map(x=>x.name.toLowerCase())).size,list.length);
 for(const p of list){
  assert.ok(p.name.length>=2&&p.name.length<=80);
  assert.ok(p.suggestedGrossCents>=100&&p.suggestedGrossCents<=200000);
  assert.ok(Number.isSafeInteger(p.suggestedGrossCents));
  assert.ok(["beer","cocktail","spirits","wine","soft_drink","other"].includes(p.category));
  assert.ok(["alcoholic","non_alcoholic","water"].includes(p.vatClass));
  for(const mode of ["dine_in","takeaway","delivery"] as const)
   assert.ok(resolveGreekBeverageVat({vatClass:p.vatClass,mode}).rateBasisPoints>0);
 }
 assert.equal(catalogueTemplateByKey("zeroBeer330")?.vatClass,"non_alcoholic");
 assert.equal(catalogueTemplateByKey("ginTonic")?.vatClass,"alcoholic");
});
test("catalogue import cannot accept arbitrary tax class, name or duplicated templates",()=>{
 assert.deepEqual(validateCatalogueSelections([{key:"espresso",baseCents:387}]),[{key:"espresso",baseCents:387}]);
 for(const x of [
  [],[{key:"bad",baseCents:387}],
  [{key:"espresso",baseCents:1}],
  [{key:"espresso",baseCents:100.1}],
  [{key:"espresso",baseCents:NaN}],
  [{key:"espresso",baseCents:387,vatClass:"alcoholic"}],
  [{key:"espresso",baseCents:387},{key:"espresso",baseCents:400}]
 ])assert.throws(()=>validateCatalogueSelections(x));
});
test("requests use exact idempotent keys and validated selection; no checkout enabled",()=>{
 const requestKey="123e4567-e89b-42d3-a456-426614174000";
 assert.deepEqual(validateCatalogueImportCommand({
  requestKey,items:[{key:"espresso",baseCents:387}]
 }),{requestKey,items:[{key:"espresso",baseCents:387}]});
 assert.throws(()=>validateCatalogueImportCommand({
  requestKey:"invalid",items:[{key:"espresso",baseCents:387}]
 }));
 const source=readFileSync(new URL("../src/lib/drinkstock-catalogue-import-service.ts",import.meta.url),"utf8");
 assert.match(source,/FOR UPDATE OF v/);
 assert.match(source,/a\.app_key='drinkStock' AND a\.enabled/);
 assert.match(source,/venue\.rehearsal_enabled\|\|venue\.session_open/);
 assert.match(source,/INSERT INTO public\.drinkstock_catalogue_imports/);
 assert.match(source,/vat_reviewed,catalogue_key/);
 assert.match(source,/commercialCheckoutEnabled:false/);
 const api=readFileSync(new URL("../src/app/api/hospitality/partners/[partnerId]/venues/[venueId]/market/import/route.ts",import.meta.url),"utf8");
 assert.match(api,/hospitalityIdentity\(\)/);
 assert.match(api,/assertCustomerCsrf/);
 assert.match(api,/get\("origin"\)/);
});

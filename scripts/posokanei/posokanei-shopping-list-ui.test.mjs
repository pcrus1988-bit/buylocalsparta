import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../../apps/web/src/components/PosoKaneiPublicClient.tsx",import.meta.url),"utf8");

const listingRoute=readFileSync(new URL("../../apps/web/src/app/api/posokanei/route.ts",import.meta.url),"utf8");

test("PosoKanei never renders the standalone approved product type explorer",()=>{
  assert.doesNotMatch(source,/Συγκρίσεις εγκεκριμένων τύπων|Διάλεξε ένα είδος για σύγκριση/);
  assert.doesNotMatch(source,/reviewedBrowser|posokanei-reviewed-comparisons|Ομάδα συγκρίσιμων/);
});

test("catalogue brand comparison renders only for actually priced, reviewed alternatives",()=>{
  assert.match(listingRoute,/approvedAlternatives:p\.groupId\?findBrandAlternatives/);
  assert.match(listingRoute,/brandIndex:approvedOnlyIndex/);
  assert.match(listingRoute,/excludedRetailerIds:\[\.\.\.excluded\]/);
  assert.match(listingRoute,/includeNonCheaper:true/);
  assert.match(source,/!!p\.approvedAlternatives\?\.length&&<button/);
  assert.match(source,/!!p\.approvedAlternatives\?\.length&&comparedProduct===p\.id&&/);
  assert.match(source,/Σύγκρινε άλλες μάρκες/);
  assert.doesNotMatch(source,/Δεν βρέθηκαν άλλα συγκρίσιμα προϊόντα με καταγεγραμμένες τιμές/);
});

test("PosoKanei still offers approved alternatives and safe substitutions on the shopping list",()=>{
  assert.match(source,/id="posokanei-basket"/);
  assert.match(source,/fetch\("\/api\/posokanei\/alternatives",\{\s*method:"POST"/);
  assert.match(source,/Φθηνότερες μάρκες για/);
  assert.match(source,/Πιθανά οικονομικότερα προϊόντα για/);
  assert.match(source,/onClick=\{\(\)=>chooseCheaper\(result\.lineId,a\)\}/);
  assert.match(source,/Αντικατάσταση μάρκας/);
  assert.match(source,/Η λίστα αγορών/);
});

test("a selected cheaper brand preserves a server-verified baseline and recalculates savings",()=>{
  assert.match(source,/replacedFrom=original\?\.kind==="exact"/);
  assert.match(source,/void calculate\(revised\)/);
  assert.match(source,/savingsIncludingBrands\(result,plan\)/);
  assert.match(source,/Συνολική εξοικονόμηση/);
  assert.match(source,/Εξοικονόμηση από επιλογή σούπερ μάρκετ/);
});

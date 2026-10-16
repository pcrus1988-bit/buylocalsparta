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

test("PosoKanei always shows compact shopping-list alternatives with explicit manual choice",()=>{
  assert.match(source,/id="posokanei-basket"/);
  assert.match(source,/fetch\("\/api\/posokanei\/alternatives",\{\s*method:"POST"/);
  assert.match(source,/includeNonCheaper:true/);
  assert.match(source,/entry\.alternatives\.length>0\|\|entry\.candidates\.length>0/);
  assert.match(source,/<section className=\{styles\.suggestion\} key=\{entry\.lineId\}/);
  assert.match(source,/Εναλλακτικές για/);
  assert.match(source,/Πιθανή εναλλακτική · μη ελεγμένη/);
  assert.match(source,/Ελεγμένος συγκρίσιμος τύπος/);
  assert.match(source,/onClick=\{\(\)=>chooseAlternative\(entry\.lineId,option\)\}/);
  assert.match(source,/window\.confirm\(/);
  assert.match(source,/packages===null\|\|packages>100/);
  assert.doesNotMatch(source,/Μη επιβεβαιωμένες εναλλακτικές:|Δεν επιτρέπεται αυτόματη αντικατάσταση|Πιθανά οικονομικότερα προϊόντα για/);
});

test("All-price shopping-list suggestions are opt-in; other API callers retain cheaper-only defaults",()=>{
  const route=readFileSync(new URL("../../apps/web/src/app/api/posokanei/alternatives/route.ts",import.meta.url),"utf8");
  assert.match(route,/includeNonCheaper:input\.includeNonCheaper===true/);
  assert.match(route,/typeof input\.includeNonCheaper!=="boolean"/);
  assert.match(route,/includeNonCheaper:allBrands/);
});

test("a chosen reviewed alternative preserves original prices and refreshes total savings",()=>{
  assert.match(source,/replacedFrom=next\.confidence==="reviewed_equivalent"/);
  assert.match(source,/void calculate\(revised\)/);
  assert.match(source,/savingsIncludingBrands\(result,plan\)/);
  assert.match(source,/Συνολική εξοικονόμηση/);
  assert.match(source,/Εξοικονόμηση από επιλογή σούπερ μάρκετ/);
  assert.match(source,/Unverified candidates remain opt-in/);
  assert.match(source,/Εναλλακτικές για/);
});

test("basket savings prompt expands verified cheaper options and selected alternatives collapse",()=>{
  assert.match(source,/summarizeCheaperAlternatives\(Object\.values\(brandResults\)\)/);
  assert.match(source,/savingsOpportunities\.productCount>0&&<button/);
  assert.match(source,/Εξοικονόμησε έως/);
  assert.match(source,/savingsOpportunities\.potentialSavingEur/);
  assert.match(source,/setExpandedAlternatives\(current=>\[\.\.\.new Set\(\[\.\.\.current,\.\.\.savingsOpportunities\.lineIds\]\)\]\)/);
  assert.match(source,/scrollIntoView\(\{behavior:"smooth",block:"start"\}\)/);
  assert.match(source,/aria-expanded=\{expandedAlternatives\.includes\(entry\.lineId\)\}/);
  assert.match(source,/expandedAlternatives\.includes\(entry\.lineId\)&&[\s\S]*?entry\.alternatives/);
  assert.match(source,/setExpandedAlternatives\(current=>current\.filter\(id=>id!==lineId\)\)/);
  assert.match(source,/void calculate\(revised\)/);
});

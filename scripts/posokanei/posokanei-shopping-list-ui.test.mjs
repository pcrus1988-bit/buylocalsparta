import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../../apps/web/src/components/PosoKaneiPublicClient.tsx",import.meta.url),"utf8");
const listingRoute=readFileSync(new URL("../../apps/web/src/app/api/posokanei/route.ts",import.meta.url),"utf8");
const alternativesRoute=readFileSync(new URL("../../apps/web/src/app/api/posokanei/alternatives/route.ts",import.meta.url),"utf8");
const savedRoute=readFileSync(new URL("../../apps/web/src/app/api/posokanei/saved-list/route.ts",import.meta.url),"utf8");
const styles=readFileSync(new URL("../../apps/web/src/components/PosoKaneiPublicClient.module.css",import.meta.url),"utf8");

test("no separate sprawling comparison explorer is rendered",()=>{
  assert.doesNotMatch(source,/Συγκρίσεις εγκεκριμένων τύπων|Διάλεξε ένα είδος για σύγκριση/);
  assert.doesNotMatch(source,/reviewedBrowser|posokanei-reviewed-comparisons|Ομάδα συγκρίσιμων/);
});

test("the catalogue offers only truly cheaper priced reviewed brands",()=>{
  assert.match(listingRoute,/approvedAlternatives:p\.groupId\?findBrandAlternatives/);
  assert.match(listingRoute,/brandIndex:approvedOnlyIndex/);
  assert.match(listingRoute,/excludedRetailerIds:\[\.\.\.excluded\]/);
  assert.match(listingRoute,/includeNonCheaper:false/);
  assert.doesNotMatch(listingRoute,/includeNonCheaper:true/);
  assert.match(source,/cheaperCatalogueOptions=p\.approvedAlternatives\.filter\(isCheaper\)/);
  assert.match(source,/cheaperCatalogueOptions\.length>0&&<button/);
  assert.match(source,/cheaperCatalogueOptions\.length>0&&comparedProduct===p\.id&&/);
  assert.match(source,/Φθηνότερες μάρκες/);
  assert.match(source,/setComparedProduct\(null\)/);
  assert.match(source,/setDismissedAlternativeLines\(current=>\[\.\.\.current,key\]\)/);
  assert.doesNotMatch(source,/Ακριβότερο κατά/);
});

test("both alternative API methods enforce cheaper-only even if callers ask for all",()=>{
  assert.match(alternativesRoute,/includeNonCheaper:false,maxResults:5/);
  assert.match(alternativesRoute,/input\.includeNonCheaper===true/);
  assert.match(alternativesRoute,/includeNonCheaper:false/);
  assert.match(alternativesRoute,/maxResults:25/);
  assert.doesNotMatch(alternativesRoute,/includeNonCheaper:input\.includeNonCheaper===true|includeNonCheaper:allBrands/);
  assert.doesNotMatch(alternativesRoute,/show\)===\"all\"/);
});

test("basket options require positive pack-matched savings in whole cents",()=>{
  assert.match(source,/Math\.round\(option\.originalTotalEur\*100\)>Math\.round\(option\.candidateTotalEur\*100\)/);
  assert.match(source,/option\.savingsEur>0/);
  assert.match(source,/x\.alternatives\.filter\(isCheaper\),candidates:x\.candidates\.filter\(isCheaper\)/);
  assert.match(source,/availableAlternativeResults\.map\(entry=>/);
  assert.match(source,/onClick=\{\(\)=>chooseAlternative\(entry\.lineId,option\)\}/);
  assert.doesNotMatch(source,/Η εναλλακτική δεν έχει επιβεβαιωθεί/);
  assert.match(source,/Αυτόματα ελεγμένη αντιστοίχιση/);
  assert.match(source,/packages===null\|\|packages>100/);
  assert.doesNotMatch(source,/Ίδια καταγεγραμμένη τιμή|Πιθανά οικονομικότερα προϊόντα για/);
});

test("the selected suggestion disappears, does not return after refresh, and remains hidden on account restore",()=>{
  assert.match(source,/setDismissedAlternativeLines\(current=>current\.includes\(lineId\)\?current:\[\.\.\.current,lineId\]\)/);
  assert.match(source,/\.filter\(entry=>!dismissedAlternativeLines\.includes\(entry\.lineId\)\)/);
  assert.match(source,/line\.kind===\"exact\"&&!dismissedAlternativeLines\.includes\(line\.id\)/);
  assert.match(source,/setExpandedAlternatives\(current=>current\.filter\(id=>id!==lineId\)\)/);
  assert.match(source,/setDismissedAlternativeLines\(data\.saved\.dismissedAlternativeLines\|\|\[\]\)/);
  assert.match(source,/draft:SavedList=\{lines,labels,excluded,maxStores:storeLimit,progress,dismissedAlternativeLines\}/);
  assert.match(savedRoute,/v\.dismissedAlternativeLines!==undefined/);
  assert.match(savedRoute,/v\.lines!\.some\(line=>line\.id===id\)/);
});

test("the opt-in savings prompt counts only outstanding cheaper alternatives",()=>{
  assert.match(source,/summarizeCheaperAlternatives\(availableAlternativeResults\)/);
  assert.match(source,/savingsOpportunities\.productCount>0&&<button/);
  assert.match(source,/savingsOpportunities\.potentialSavingEur/);
  assert.match(source,/Πρόσθετη δυνητική εξοικονόμηση/);
  assert.match(source,/replacedFrom=\["reviewed_equivalent","automatically_verified"\]\.includes\(next\.confidence\)/);
  assert.match(source,/setExpandedAlternatives\(current=>\[\.\.\.new Set\(\[\.\.\.current,\.\.\.savingsOpportunities\.lineIds\]\)\]\)/);
  assert.match(source,/aria-expanded=\{expandedAlternatives\.includes\(entry\.lineId\)\}/);
  assert.match(source,/void calculate\(revised\)/);
  assert.match(source,/savingsIncludingBrands\(result,plan\)/);
});

test("simplified UI keeps grouped cross-off list and an explicit account-gated save",()=>{
  assert.match(source,/id="posokanei-basket"/);
  assert.match(source,/className=\{styles\.listDetails\} open/);
  assert.match(source,/type="checkbox" checked=\{completed\.has\(item\.lineId\)\}/);
  assert.match(source,/\/login\?next=/);
  assert.match(source,/Συνολική εξοικονόμηση/);
  assert.match(styles,/\.selectedAlternativeNote/);
  assert.match(styles,/\.suggestionLine/);
});

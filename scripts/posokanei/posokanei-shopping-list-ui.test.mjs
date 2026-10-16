import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../../apps/web/src/components/PosoKaneiPublicClient.tsx",import.meta.url),"utf8");

test("PosoKanei does not render standalone reviewed-group browsing or catalogue brand comparison",()=>{
  assert.doesNotMatch(source,/Συγκρίσεις εγκεκριμένων τύπων|Διάλεξε ένα είδος για σύγκριση/);
  assert.doesNotMatch(source,/reviewedBrowser|posokanei-reviewed-comparisons|comparablePanel/);
  assert.doesNotMatch(source,/Σύγκρινε άλλες μάρκες|Ομάδα συγκρίσιμων/);
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

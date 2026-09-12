import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/app/product/[id]/page.tsx", import.meta.url);

test("dropship product detail distinguishes supplier availability from local stock", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const isDropship = Boolean\(dropshipPresentation\)/);
  assert.match(source, /isDropship \? "Διαθέσιμο για αποστολή" : "Σε τοπικό απόθεμα"/);
  assert.match(source, /isDropship \? "Επιβεβαιωμένη διαθεσιμότητα προμηθευτή" : "Πραγματικό τοπικό απόθεμα"/);
  assert.match(source, /Η διαθεσιμότητα ενημερώνεται από τον προμηθευτή και επανελέγχεται πριν από την παραγγελία\./);
  assert.match(source, /isDropship \? "Αποστολή" : "Παραλαβή ή αποστολή"/);
  assert.match(source, /Η αγορά ενεργοποιείται ξανά μόλις επιβεβαιωθεί διαθεσιμότητα από τον προμηθευτή\./);

  // Local products retain their existing local-stock messaging.
  assert.match(source, /Σε τοπικό απόθεμα/);
  assert.match(source, /Πραγματικό τοπικό απόθεμα/);
  assert.match(source, /Η διαθεσιμότητα προέρχεται από ενεργό κατάστημα και επιλέξιμο προϊόν\./);
});

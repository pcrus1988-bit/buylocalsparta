import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../src/app/product/[id]/page.tsx", import.meta.url);

test("dropship product detail stays transparent without over-explaining supplier fulfilment", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const isDropship = Boolean\(dropshipPresentation\)/);
  assert.match(source, /isDropship \? "Διαθέσιμο για αποστολή" : "Σε τοπικό απόθεμα"/);
  assert.match(source, /isDropship \? "Αποστολή από συνεργαζόμενο προμηθευτή\." : "Η επιλογή αυτή μπορεί να προστεθεί άμεσα στο καλάθι\."/);
  assert.match(source, /ProductPurchaseInfoDialogs supplierFulfilled=\{isDropship\} showLocationLink=\{!isDropship\}/);
  assert.match(source, /!isDropship \? <ProductVendorHumanCard/);
  assert.match(source, /isDropship \? " · Αποστολή πανελλαδικά" : " · Sparta 23100"/);

  // Supplier transparency remains, but warning-style repetition is deliberately absent.
  assert.doesNotMatch(source, /Επιβεβαιωμένη διαθεσιμότητα συνεργαζόμενου προμηθευτή/);
  assert.doesNotMatch(source, /Η διαθεσιμότητα ενημερώνεται από τον προμηθευτή και επανελέγχεται πριν από την παραγγελία/);
  assert.doesNotMatch(source, /Αγορά μέσω ΚΟΝΤΑ ΜΟΥ/);
  assert.doesNotMatch(source, /Πώς λειτουργούν η τιμή και η αποστολή/);

  // Dropshipping implementation metadata is explicitly private on customer-facing detail/schema output.
  assert.match(source, /"external_product_id"/);
  assert.match(source, /"external_variant_id"/);
  assert.match(source, /"supplier_content"/);
  assert.match(source, /availableAtOrFrom: !isDropship/);

  // Local products retain their existing local-stock reassurance.
  assert.match(source, /Σε τοπικό απόθεμα/);
  assert.match(source, /Πραγματικό τοπικό απόθεμα/);
  assert.match(source, /Η διαθεσιμότητα προέρχεται από ενεργό κατάστημα και επιλέξιμο προϊόν\./);
});

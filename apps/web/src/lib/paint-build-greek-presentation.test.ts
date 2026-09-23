import assert from "node:assert/strict";
import test from "node:test";
import {
  paintBuildFinishLabel,
  paintBuildGreekText,
  paintBuildManufacturerDescription,
  paintBuildProductTitle,
  paintBuildTintBaseLabel
} from "./paint-build-greek-presentation.ts";

test("Aquavit is presented as a water-based polyurethane enamel, not legacy ripolini copy", () => {
  const title = paintBuildProductTitle("Ριπολίνη νερού VITEX AQUAVIT ECO MAT TR 675 ml", "Aquavit Eco");
  assert.match(title, /πολυουρεθανικό ακρυλικό βερνικόχρωμα νερού/i);
  assert.doesNotMatch(title, /ριπολίνη/i);
});

test("manufacturer application language is localized while product names remain intact", () => {
  assert.equal(
    paintBuildGreekText("wood: prepare and prime with Velatura Eco; Diaxyl Extra WB preservative where needed"),
    "Ξύλο: κάνε την κατάλληλη προεργασία και αστάρωσε με Velatura Eco· όπου απαιτείται, χρησιμοποίησε συντηρητικό ξύλου Diaxyl Extra WB."
  );
  assert.equal(paintBuildGreekText("spray gun"), "πιστόλι βαφής");
  assert.equal(paintBuildGreekText("airless spray"), "πιστόλι airless");
});

test("customer-facing technical shorthand is explained in Greek", () => {
  assert.equal(
    paintBuildGreekText("Σύμφωνα με σκόνη/φινίρισμα/SDS."),
    "Σύμφωνα με τον κίνδυνο σκόνης, το φινίρισμα και το Δελτίο Δεδομένων Ασφαλείας (SDS)."
  );
  assert.equal(paintBuildFinishLabel("mat / satin / gloss"), "ματ / σατινέ / γυαλιστερό");
  assert.equal(paintBuildTintBaseLabel("TR"), "TR (διάφανη βάση)");
});


test("eligibility copy from manufacturer rules is fully presented in Greek", () => {
  assert.equal(
    paintBuildGreekText("VITEX Care is documented for sound old paint and the reviewed interior repaint pathway; current manufacturer preparation requirements still apply."),
    "VITEX Care έχει τεκμηριωμένη εφαρμογή από τη VITEX πάνω σε σταθερή παλιά βαφή για το συγκεκριμένο ελεγμένο σενάριο επαναβαφής εσωτερικού χώρου. Εξακολουθούν να ισχύουν οι απαιτήσεις προετοιμασίας του κατασκευαστή."
  );
});

test("VITEX Care description is generated from verified manufacturer fields in Greek", () => {
  const description = paintBuildManufacturerDescription({
    productName: "Vitex Care",
    productCategory: "interior wall paint",
    subcategory: "premium mat emulsion paint",
    interiorExterior: "interior",
    substrateTypes: ["concrete", "plaster", "brick", "gypsum board", "sound old paint"]
  });
  assert.equal(
    description,
    "Υψηλής ποιότητας ματ πλαστικό χρώμα για εσωτερική χρήση. Σύμφωνα με τα επαληθευμένα στοιχεία της VITEX, προορίζεται για εφαρμογή σε σκυρόδεμα, σοβά, τούβλο, γυψοσανίδα και σταθερές παλιές βαμμένες επιφάνειες."
  );
  assert.doesNotMatch(description, /\b(?:interior|sound old paint|emulsion paint|gypsum board)\b/i);
});

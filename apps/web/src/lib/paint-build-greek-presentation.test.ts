import assert from "node:assert/strict";
import test from "node:test";
import {
  paintBuildFinishLabel,
  paintBuildGreekText,
  paintBuildProductTitle,
  paintBuildTintBaseLabel
} from "./paint-build-greek-presentation.ts";

test("Aquavit is presented as a water-based polyurethane enamel, not legacy ripolini copy", () => {
  const title = paintBuildProductTitle("Ριπολίνη νερού VITEX AQUAVIT ECO MAT TR 675 ml", "Aquavit Eco");
  assert.match(title, /πολυουρεθανικό βερνικόχρωμα νερού/i);
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

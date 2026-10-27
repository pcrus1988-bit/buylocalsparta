import test from "node:test";
import assert from "node:assert/strict";
import { publicResearchQ18DisplayText } from "./research-q18-publication-moderation.ts";

test("withholds the explicitly excluded Q18 response in every display path", () => {
  assert.equal(publicResearchQ18DisplayText(47198, "Example"), null);
  assert.equal(publicResearchQ18DisplayText("quote-47198-competition", "Example"), null);
});
test("blocks an already approved release quote when its answer ID was replaced", () => {
  assert.equal(publicResearchQ18DisplayText("release-quote-1", "Να έπαιρνε μαζί του τους Εβραίους"), null);
});
test("masks the requested term while retaining the rest of the comment", () => {
  assert.equal(
    publicResearchQ18DisplayText(2035, "Να εξαφανιστεί η λαίλαπα που λέγεται Μητσοτάκης."),
    "Να εξαφανιστεί η [λογοκρίθηκε] που λέγεται Μητσοτάκης."
  );
  assert.equal(publicResearchQ18DisplayText(2035, "Η ΛΑΙΛΑΠΑ"), "Η [λογοκρίθηκε]");
});
test("does not exclude other Q18 political criticism or legitimate economic answers", () => {
  assert.equal(publicResearchQ18DisplayText(3035, "Η ΚΥΒΕΡΝΗΣΗ"), "Η ΚΥΒΕΡΝΗΣΗ");
  assert.equal(publicResearchQ18DisplayText(208, "Τα πολλά λειτουργικά έξοδα"), "Τα πολλά λειτουργικά έξοδα");
});

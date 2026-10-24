import assert from "node:assert/strict";
import test from "node:test";
import {
  GREEK_RETAIL_RESULTS_PUBLICATION_AT,
  GREEK_RETAIL_RESULTS_PUBLICATION_ATHENS,
  eligibleGreekRetailPublicationAt,
  greekRetailResultsCutoffReached
} from "./research-results-publication.ts";

test("Athens results publication is Nov 1 at precisely 00:00:01 EET", () => {
  assert.equal(
    new Date(GREEK_RETAIL_RESULTS_PUBLICATION_ATHENS).toISOString(),
    GREEK_RETAIL_RESULTS_PUBLICATION_AT
  );
  assert.equal(GREEK_RETAIL_RESULTS_PUBLICATION_AT, "2026-10-31T22:00:01.000Z");
});

test("the last prepublication millisecond remains private", () => {
  const before = new Date("2026-10-31T22:00:00.999Z");
  const at = new Date("2026-10-31T22:00:01.000Z");
  const after = new Date("2026-10-31T22:00:01.001Z");
  assert.equal(greekRetailResultsCutoffReached(before), false);
  assert.equal(greekRetailResultsCutoffReached(at), true);
  assert.equal(greekRetailResultsCutoffReached(after), true);
  assert.equal(eligibleGreekRetailPublicationAt(before), GREEK_RETAIL_RESULTS_PUBLICATION_AT);
  assert.equal(eligibleGreekRetailPublicationAt(at), GREEK_RETAIL_RESULTS_PUBLICATION_AT);
  assert.equal(eligibleGreekRetailPublicationAt(after), after.toISOString());
});

test("an invalid publication clock fails closed", () => {
  assert.equal(greekRetailResultsCutoffReached(new Date("not a date")), false);
  assert.throws(() => eligibleGreekRetailPublicationAt(new Date("not a date")), /CLOCK_INVALID/);
});

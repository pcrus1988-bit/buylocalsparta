import assert from "node:assert/strict";
import test from "node:test";
import { EXPERIMENT_ATTRIBUTE_MIN_BASE, experimentSelectionRate } from "./research-experiment-analytics-core.ts";

test("attribute selection uses exposures, not only chosen alternatives, as denominator", () => {
  assert.equal(experimentSelectionRate(12, 40), 30);
  assert.equal(experimentSelectionRate(0, 40), 0);
  assert.equal(experimentSelectionRate(17, 60), 28.3);
});

test("small exposed bases suppress rates, including zero chosen", () => {
  assert.equal(experimentSelectionRate(0, EXPERIMENT_ATTRIBUTE_MIN_BASE - 1), null);
  assert.equal(experimentSelectionRate(1, 1), null);
  assert.equal(experimentSelectionRate(15, EXPERIMENT_ATTRIBUTE_MIN_BASE), 50);
});

test("invalid aggregates never become a plausible percentage", () => {
  assert.equal(experimentSelectionRate(31, 30), null);
  assert.equal(experimentSelectionRate(-1, 100), null);
  assert.equal(experimentSelectionRate(1, Number.NaN), null);
  assert.equal(experimentSelectionRate(1.5, 100), null);
  assert.equal(experimentSelectionRate(10, 0), null);
});

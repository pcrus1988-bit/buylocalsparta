import assert from "node:assert/strict";
import test from "node:test";
import {
  normal95ConfidenceInterval,
  normalTwoSidedPValue,
  proportionalStratumAllocation,
  researchWeightDiagnostics,
  stratifiedSrsMeanVariance
} from "./research-survey-statistics.ts";

test("stratified variance uses finite-population correction across strata", () => {
  const design = [
    { stratumId: "a", finalWeight: 25 },
    { stratumId: "a", finalWeight: 25 },
    { stratumId: "b", finalWeight: 25 },
    { stratumId: "b", finalWeight: 25 }
  ];
  const result = stratifiedSrsMeanVariance([
    { stratumId: "a", value: 0 },
    { stratumId: "a", value: 1 },
    { stratumId: "b", value: 0 },
    { stratumId: "b", value: 1 }
  ], design);
  assert.equal(result.reason, undefined);
  assert.ok((result.standardError ?? 0) > 0);
  assert.equal(result.confidenceLevel, 0.95);
});

test("variance is withheld when a metric has item nonresponse inside a sampled stratum", () => {
  const result = stratifiedSrsMeanVariance([
    { stratumId: "a", value: 1 }
  ], [
    { stratumId: "a", finalWeight: 10 },
    { stratumId: "a", finalWeight: 10 }
  ]);
  assert.equal(result.reason, "item_nonresponse");
  assert.equal(result.standardError, undefined);
});

test("variance is withheld when a contributing stratum has fewer than two respondents", () => {
  const result = stratifiedSrsMeanVariance([
    { stratumId: "a", value: 1 },
    { stratumId: "b", value: 0 },
    { stratumId: "b", value: 1 }
  ], [
    { stratumId: "a", finalWeight: 20 },
    { stratumId: "b", finalWeight: 10 },
    { stratumId: "b", finalWeight: 10 }
  ]);
  assert.equal(result.reason, "insufficient_stratum_n");
});

test("proportion confidence intervals are clipped to the logical 0-1 range", () => {
  assert.deepEqual(normal95ConfidenceInterval(0.98, 0.05, "proportion"), {
    lower: 0.8820018007729973,
    upper: 1
  });
});

test("variance is withheld if later calibration creates unequal weights inside a stratum", () => {
  const result = stratifiedSrsMeanVariance([
    { stratumId: "a", value: 0 },
    { stratumId: "a", value: 1 }
  ], [
    { stratumId: "a", finalWeight: 9 },
    { stratumId: "a", finalWeight: 11 }
  ]);
  assert.equal(result.reason, "unequal_within_stratum_weights");
});


test("sample allocation prefers two units per stratum when the requested n can cover them", () => {
  const result = proportionalStratumAllocation([
    { id: "a", populationCount: 100 },
    { id: "b", populationCount: 10 },
    { id: "c", populationCount: 1 }
  ], 20, 2);
  assert.equal(result.reduce((sum, item) => sum + item.sampleCount, 0), 20);
  assert.ok((result.find((item) => item.id === "a")?.sampleCount ?? 0) >= 2);
  assert.ok((result.find((item) => item.id === "b")?.sampleCount ?? 0) >= 2);
  assert.equal(result.find((item) => item.id === "c")?.sampleCount, 1);
});

test("sample allocation falls back to one-per-stratum when n cannot cover the preferred floor", () => {
  const result = proportionalStratumAllocation([
    { id: "a", populationCount: 100 },
    { id: "b", populationCount: 100 },
    { id: "c", populationCount: 100 }
  ], 4, 2);
  assert.equal(result.reduce((sum, item) => sum + item.sampleCount, 0), 4);
  assert.ok(result.every((item) => item.sampleCount >= 1));
});


test("weight diagnostics preserve full effective n for equal weights", () => {
  const result = researchWeightDiagnostics([2, 2, 2, 2]);
  assert.equal(result.count, 4);
  assert.equal(result.weightSum, 8);
  assert.equal(result.minWeight, 2);
  assert.equal(result.maxWeight, 2);
  assert.equal(result.coefficientOfVariation, 0);
  assert.equal(result.kishEffectiveN, 4);
  assert.equal(result.weightingDesignEffect, 1);
});

test("weight diagnostics expose effective-sample loss from unequal weights", () => {
  const result = researchWeightDiagnostics([1, 1, 1, 7]);
  assert.equal(result.count, 4);
  assert.ok((result.kishEffectiveN ?? 4) < 2);
  assert.ok((result.weightingDesignEffect ?? 1) > 2);
  assert.ok((result.coefficientOfVariation ?? 0) > 1);
});


test("two-sided normal p-value is one at zero difference", () => {
  assert.ok(Math.abs((normalTwoSidedPValue(0) ?? 0) - 1) < 1e-6);
});

test("two-sided normal p-value is approximately five percent at the 95% critical z", () => {
  const p = normalTwoSidedPValue(1.959963984540054);
  assert.ok(p !== undefined);
  assert.ok(Math.abs(p - 0.05) < 0.001);
});

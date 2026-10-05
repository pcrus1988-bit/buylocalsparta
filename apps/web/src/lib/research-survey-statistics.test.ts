import assert from "node:assert/strict";
import test from "node:test";
import {
  normal95ConfidenceInterval,
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

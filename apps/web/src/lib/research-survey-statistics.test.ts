import assert from "node:assert/strict";
import test from "node:test";
import {
  benjaminiHochbergAdjustedPValues,
  calibrateResearchWeights,
  normal95ConfidenceInterval,
  normalTwoSidedPValue,
  proportionalStratumAllocation,
  researchFieldworkOutcomeSummary,
  researchWeightDiagnostics,
  stratifiedSrsMeanVariance,
  weightedClusteredDifferenceInMeans
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


test("Benjamini-Hochberg adjustment is monotone in sorted p-value order", () => {
  const adjusted = benjaminiHochbergAdjustedPValues([0.01, 0.04, 0.03, 0.002]);
  assert.equal(adjusted.length, 4);
  assert.ok(Math.abs(adjusted[0]! - 0.02) < 1e-12);
  assert.ok(Math.abs(adjusted[1]! - 0.04) < 1e-12);
  assert.ok(Math.abs(adjusted[2]! - 0.04) < 1e-12);
  assert.ok(Math.abs(adjusted[3]! - 0.008) < 1e-12);
});

test("Benjamini-Hochberg adjustment clamps invalid probability inputs", () => {
  assert.deepEqual(benjaminiHochbergAdjustedPValues([-1, 2]), [0, 1]);
});


test("clustered experimental contrast keeps repeated profile evaluations inside respondent clusters", () => {
  const result = weightedClusteredDifferenceInMeans([
    { clusterId: "r1", group: "level", value: 1, weight: 2 },
    { clusterId: "r1", group: "reference", value: 0, weight: 2 },
    { clusterId: "r2", group: "level", value: 0, weight: 1 },
    { clusterId: "r2", group: "reference", value: 1, weight: 1 },
    { clusterId: "r3", group: "level", value: 1, weight: 1 },
    { clusterId: "r3", group: "reference", value: 0, weight: 1 }
  ]);
  assert.equal(result.reason, undefined);
  assert.equal(result.clusterCount, 3);
  assert.equal(result.levelClusterCount, 3);
  assert.equal(result.referenceClusterCount, 3);
  assert.ok(Math.abs((result.levelMean ?? 0) - 0.75) < 1e-12);
  assert.ok(Math.abs((result.referenceMean ?? 0) - 0.25) < 1e-12);
  assert.ok(Math.abs((result.difference ?? 0) - 0.5) < 1e-12);
  assert.ok((result.standardError ?? 0) > 0);
});

test("clustered experimental contrast withholds variance when only one respondent contributes", () => {
  const result = weightedClusteredDifferenceInMeans([
    { clusterId: "r1", group: "level", value: 1, weight: 1 },
    { clusterId: "r1", group: "reference", value: 0, weight: 1 }
  ]);
  assert.equal(result.difference, 1);
  assert.equal(result.reason, "insufficient_clusters");
  assert.equal(result.standardError, undefined);
});


test("fieldwork outcome summary seals a complete final-disposition ledger and freezes denominator rules", () => {
  const result = researchFieldworkOutcomeSummary(100, [
    { dispositionCode: "complete", eligibility: "eligible", count: 40 },
    { dispositionCode: "partial", eligibility: "eligible", count: 5 },
    { dispositionCode: "refusal", eligibility: "eligible", count: 10 },
    { dispositionCode: "withdrawn", eligibility: "eligible", count: 2 },
    { dispositionCode: "noncontact", eligibility: "unknown", count: 20 },
    { dispositionCode: "bounce", eligibility: "unknown", count: 8 },
    { dispositionCode: "ineligible", eligibility: "ineligible", count: 10 },
    { dispositionCode: "out_of_scope", eligibility: "ineligible", count: 5 }
  ]);

  assert.equal(result.sealed, true);
  assert.equal(result.latestDispositionTotal, 100);
  assert.equal(result.netSample, 85);
  assert.equal(result.completed, 40);
  assert.equal(result.partial, 5);
  assert.equal(result.unknownEligibility, 28);
  assert.equal(result.completionRateOfNetSample, 40 / 85);
  assert.equal(result.participationRateOfNetSample, 45 / 85);
  assert.equal(result.explicitDecisionCompletionShare, 40 / 57);
  assert.equal(result.explicitDecisionRefusalShare, 10 / 57);
});

test("fieldwork outcome summary refuses to call progress-state dispositions sealed", () => {
  const result = researchFieldworkOutcomeSummary(10, [
    { dispositionCode: "complete", eligibility: "eligible", count: 8 },
    { dispositionCode: "opened", eligibility: "eligible", count: 2 }
  ]);
  assert.equal(result.latestDispositionTotal, 10);
  assert.equal(result.unresolved, 2);
  assert.equal(result.sealed, false);
});


test("calibration rakes included responses to declared population margins", () => {
  const result = calibrateResearchWeights([
    { id: "1", initialWeight: 8, categories: { region_code: "A", sector_code: "X" } },
    { id: "2", initialWeight: 2, categories: { region_code: "A", sector_code: "Y" } },
    { id: "3", initialWeight: 3, categories: { region_code: "B", sector_code: "X" } },
    { id: "4", initialWeight: 7, categories: { region_code: "B", sector_code: "Y" } }
  ], [
    { dimension: "region_code", category: "A", target: 50 },
    { dimension: "region_code", category: "B", target: 50 },
    { dimension: "sector_code", category: "X", target: 60 },
    { dimension: "sector_code", category: "Y", target: 40 }
  ], {
    dimensions: ["region_code", "sector_code"],
    maxIterations: 100,
    tolerance: 1e-10
  });

  const weight = new Map(result.weights.map((item) => [item.id, item.finalWeight]));
  assert.ok(Math.abs((weight.get("1") ?? 0) + (weight.get("2") ?? 0) - 50) < 1e-7);
  assert.ok(Math.abs((weight.get("3") ?? 0) + (weight.get("4") ?? 0) - 50) < 1e-7);
  assert.ok(Math.abs((weight.get("1") ?? 0) + (weight.get("3") ?? 0) - 60) < 1e-7);
  assert.ok(Math.abs((weight.get("2") ?? 0) + (weight.get("4") ?? 0) - 40) < 1e-7);
  assert.ok(result.diagnostics.maxRelativeMarginError <= 1e-10);
});

test("calibration fails closed when a positive target cell has no respondent", () => {
  assert.throws(() => calibrateResearchWeights([
    { id: "1", initialWeight: 1, categories: { region_code: "A" } }
  ], [
    { dimension: "region_code", category: "A", target: 50 },
    { dimension: "region_code", category: "B", target: 50 }
  ], {
    dimensions: ["region_code"],
    maxIterations: 20,
    tolerance: 1e-8
  }), /RESEARCH_CALIBRATION_EMPTY_CELL:region_code:B/);
});

test("median-ratio trimming is followed by bounded raking back to margins", () => {
  const result = calibrateResearchWeights([
    { id: "1", initialWeight: 100, categories: { region_code: "A" } },
    { id: "2", initialWeight: 1, categories: { region_code: "A" } },
    { id: "3", initialWeight: 1, categories: { region_code: "B" } },
    { id: "4", initialWeight: 1, categories: { region_code: "B" } }
  ], [
    { dimension: "region_code", category: "A", target: 50 },
    { dimension: "region_code", category: "B", target: 50 }
  ], {
    dimensions: ["region_code"],
    maxIterations: 200,
    tolerance: 1e-9,
    trimMedianRatio: 1.5
  });

  assert.ok((result.diagnostics.trimmedUnitCount ?? 0) > 0);
  assert.ok(result.diagnostics.trimCap !== null);
  assert.ok(result.weights.every((item) => item.finalWeight <= result.diagnostics.trimCap! + 1e-7));
  const byRegionA = result.weights[0]!.finalWeight + result.weights[1]!.finalWeight;
  const byRegionB = result.weights[2]!.finalWeight + result.weights[3]!.finalWeight;
  assert.ok(Math.abs(byRegionA - 50) < 1e-6);
  assert.ok(Math.abs(byRegionB - 50) < 1e-6);
});

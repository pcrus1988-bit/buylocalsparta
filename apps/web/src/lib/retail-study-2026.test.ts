import assert from "node:assert/strict";
import test from "node:test";
import {
  RETAIL_STUDY_2026_DEFINITION,
  calibrateRetailStudyWeights,
  effectiveSampleSize,
  scoreRetailStudy,
  stableJson,
  validateRetailStudyAnswers,
  weightedSingleChoiceEstimate,
  type AnalysisRecord
} from "./retail-study-2026.ts";

test("freezes a neutral, versioned 2026 retail instrument with reproducible core metadata", () => {
  assert.equal(RETAIL_STUDY_2026_DEFINITION.slug, "greek-retail-2026");
  assert.equal(RETAIL_STUDY_2026_DEFINITION.version, 1);
  assert.ok(RETAIL_STUDY_2026_DEFINITION.questions.length >= 15);
  assert.match(stableJson(RETAIL_STUDY_2026_DEFINITION), /digitalReadiness/);
});

test("scores the preregistered digital readiness, friction and local visibility measures deterministically", () => {
  const scores = scoreRetailStudy({
    digital_capabilities: ["website", "ecommerce", "digital_catalogue", "live_inventory", "digital_payments", "marketplace"],
    commerce_friction: {
      catalogue: "3", photos_content: "3", inventory: "3", marketing: "3",
      fees: "3", shipping: "3", returns: "3", time_skills: "3"
    },
    local_customer_share: "76-100",
    local_inventory_discoverability: "0"
  });
  assert.equal(scores.digitalReadiness, 50);
  assert.equal(scores.digitalReadinessBand, "digitally_selling");
  assert.equal(scores.commerceFriction, 50);
  assert.equal(scores.localVisibilityGap, 88);
});

test("validates conditional marketplace questions only when marketplace sales are selected", () => {
  const base = validAnswers();
  base.sales_channels = ["physical_store"];
  assert.deepEqual(validateRetailStudyAnswers(base), []);

  base.sales_channels = ["physical_store", "marketplace"];
  const errors = validateRetailStudyAnswers(base);
  assert.ok(errors.includes("marketplace_online_share:required"));
});

test("post-stratification rebalances an uneven respondent mix back toward frozen frame totals", () => {
  const records: AnalysisRecord[] = [
    ...Array.from({ length: 4 }, (_, index) => record("a" + index, "A", "fashion", "Attica", "yes")),
    ...Array.from({ length: 6 }, (_, index) => record("b" + index, "B", "beauty", "Attica", "no"))
  ];
  const weighted = calibrateRetailStudyWeights(records, [
    { stratumKey: "A", populationCount: 60 },
    { stratumKey: "B", populationCount: 40 }
  ]);
  const fashionWeight = weighted.filter((row) => row.stratumKey === "A").reduce((sum, row) => sum + row.weight, 0);
  const beautyWeight = weighted.filter((row) => row.stratumKey === "B").reduce((sum, row) => sum + row.weight, 0);
  assert.ok(Math.abs(fashionWeight / (fashionWeight + beautyWeight) - 0.6) < 0.000001);

  const yes = weightedSingleChoiceEstimate(weighted, "test_outcome", "yes", "census_invitation");
  assert.equal(yes.rawBase, 10);
  assert.equal(yes.estimate, 0.6);
  assert.equal(yes.interval95, null);
  assert.equal(yes.precisionLabel, "not_applicable_nonresponse_or_nonprobability");
});

test("only probability-sample mode exposes the approximate probability interval", () => {
  const records = Array.from({ length: 60 }, (_, index) =>
    record("r" + index, "A", "fashion", "Attica", index < 30 ? "yes" : "no")
  );
  const weighted = calibrateRetailStudyWeights(records, [{ stratumKey: "A", populationCount: 600 }]);
  const probability = weightedSingleChoiceEstimate(weighted, "test_outcome", "yes", "stratified_probability_sample");
  const census = weightedSingleChoiceEstimate(weighted, "test_outcome", "yes", "census_invitation");
  assert.ok(probability.interval95);
  assert.equal(census.interval95, null);
  assert.equal(probability.publishable, true);
});

test("effective sample size decreases when weights become unequal", () => {
  assert.equal(effectiveSampleSize([1, 1, 1, 1]), 4);
  assert.ok(effectiveSampleSize([0.25, 0.25, 0.25, 4]) < 4);
});

function record(id: string, stratumKey: string, sectorGroup: string, prefecture: string, outcome: string): AnalysisRecord {
  return {
    id,
    stratumKey,
    sectorGroup,
    prefecture,
    selectionProbability: 1,
    answers: { test_outcome: outcome }
  };
}

function validAnswers(): Record<string, unknown> {
  return {
    sector_primary: "fashion-footwear",
    employees: "2-4",
    locations: "1",
    sales_channels: ["physical_store"],
    online_sales_share: "0",
    local_customer_share: "51-75",
    local_inventory_discoverability: "1",
    digital_capabilities: ["website"],
    commerce_friction: {
      catalogue: "3", photos_content: "3", inventory: "3", marketing: "3",
      fees: "3", shipping: "3", returns: "3", time_skills: "3"
    },
    top_barriers: ["time"],
    sustainable_commission: "6-10",
    merchant_identity_importance: "5",
    helpful_tools: ["local_discovery"],
    next_12_months: ["more_online_sales"]
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  researchQuestionVisible,
  scoreGreekRetail2026,
  validateResearchAnswers,
  type ResearchQuestion
} from "./research-survey-model.ts";
import {
  RETAIL_SENTIMENT_2026_QUESTIONS,
  withRetailConfidencePreregistration
} from "./research-retail-sentiment-2026.ts";

const questions: ResearchQuestion[] = RETAIL_SENTIMENT_2026_QUESTIONS.map((question) => ({
  ...question,
  id: question.code
}));

test("economic module has stable codes and distinct analysis keys", () => {
  assert.deepEqual(questions.map((question) => question.code),
    ["Q19", "Q20", "Q21", "Q22", "Q23", "Q24", "Q25", "Q26", "Q27"]);
  assert.equal(new Set(questions.map((question) => question.analysisKey)).size, 9);
  assert.equal(questions.every((question) => question.sectionCode === "G"), true);
});

test("marketplace impacts are limited to current and former sellers", () => {
  const question = questions.find((item) => item.code === "Q23")!;
  assert.equal(researchQuestionVisible(question, { Q13: "current" }), true);
  assert.equal(researchQuestionVisible(question, { Q13: "past" }), true);
  assert.equal(researchQuestionVisible(question, { Q13: "considering" }), false);
  assert.equal(researchQuestionVisible(question, {}), false);
});

test("first-sale barriers and visibility expectation respect prior answers", () => {
  const firstSale = questions.find((item) => item.code === "Q24")!;
  const expectation = questions.find((item) => item.code === "Q26")!;
  assert.equal(researchQuestionVisible(firstSale, { Q04: "0" }), true);
  assert.equal(researchQuestionVisible(firstSale, { Q04: "11_25" }), false);
  assert.equal(researchQuestionVisible(expectation, { Q25: "no_presence" }), true);
  assert.equal(researchQuestionVisible(expectation, { Q25: "unchanged" }), false);
});

test("required conditional questions are not missing for ineligible respondents", () => {
  const result = validateResearchAnswers([
    questions.find((item) => item.code === "Q23")!,
    questions.find((item) => item.code === "Q24")!,
    questions.find((item) => item.code === "Q26")!
  ], { Q13: "never", Q04: "26_50", Q25: "increased_some" });
  assert.deepEqual(result, { ok: true, missing: [], invalid: [] });
});

test("confidence index is 0 to 100 and requires complete three-item data", () => {
  assert.equal(scoreGreekRetail2026({
    Q19: "very_pessimistic", Q17: "down_large", Q20: "very_unlikely"
  }).businessConfidenceScore, 0);
  assert.equal(scoreGreekRetail2026({
    Q19: "very_optimistic", Q17: "up_large", Q20: "very_likely"
  }).businessConfidenceScore, 100);
  assert.equal(scoreGreekRetail2026({
    Q19: "pessimistic", Q17: "stable", Q20: "likely"
  }).businessConfidenceScore, 50);
  assert.equal(scoreGreekRetail2026({
    Q19: "unknown", Q17: "up_small", Q20: "likely"
  }).businessConfidenceScore, undefined);
  assert.equal(scoreGreekRetail2026({ Q17: "stable" }).businessConfidenceScore, undefined);
});

test("preregistration preserves original primary metrics and is idempotent", () => {
  const base = {
    primaryOutcomes: [
      { metricKey: "digital_readiness.mean" },
      { metricKey: "retail_friction.mean" }
    ]
  };
  const once = withRetailConfidencePreregistration(base, "0.2.0-rdraft");
  const twice = withRetailConfidencePreregistration(once, "0.2.0-rdraft");
  const keys = (twice.primaryOutcomes as Array<{ metricKey: string }>).map((item) => item.metricKey);
  assert.deepEqual(keys, [
    "digital_readiness.mean", "retail_friction.mean", "retail_confidence.mean"
  ]);
  assert.equal((twice.confidenceIndex as { missingness: string }).missingness.startsWith("Complete-case"), true);
});

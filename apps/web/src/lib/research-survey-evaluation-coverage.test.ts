import assert from "node:assert/strict";
import test from "node:test";
import { RETAIL_SENTIMENT_2026_QUESTIONS } from "./research-retail-sentiment-2026.ts";
import {
  questionCoverageIsCurrent,
  questionEvaluationMeasures,
  planWithCurrentQuestionCoverage
} from "./research-survey-evaluation-coverage.ts";
import type { ResearchQuestion } from "./research-survey-model.ts";

const questions: ResearchQuestion[] = RETAIL_SENTIMENT_2026_QUESTIONS.map((q) => ({ ...q, id: q.code }));

test("new economic and sentiment questions map to actual executable metric keys", () => {
  const measures = questionEvaluationMeasures(questions);
  assert.equal(measures.length, 9);
  assert.deepEqual(measures.map((item) => item.questionCode),
    ["Q19", "Q20", "Q21", "Q22", "Q23", "Q24", "Q25", "Q26", "Q27"]);
  const q21 = measures.find((item) => item.questionCode === "Q21")!;
  assert.ok(q21.metricKeys.includes("business_financial_trends_12m.turnover.share.increased"));
  const q22 = measures.find((item) => item.questionCode === "Q22")!;
  assert.ok(q22.metricKeys.includes("ecommerce_attitudes.opportunity.mean"));
  assert.ok(!q22.metricKeys.some((item) => item.includes(".share.")));
  const q24 = measures.find((item) => item.questionCode === "Q24")!;
  assert.ok(q24.metricKeys.includes("first_online_sale_barriers.share.setup_cost"));
  assert.deepEqual(q24.routing, { code: "Q04", operator: "in", values: ["0"] });
  assert.ok(q24.missingness.includes("totals may exceed 100%"));
});

test("synchronizing coverage keeps primary outcomes and exploratory investigations unchanged", () => {
  const initial = {
    primaryOutcomes: [{ metricKey: "retail_confidence.mean" }],
    exploratoryAnalyses: [{ family: "headline_pairwise_region_sector", metrics: ["retail_confidence.mean"] }],
    secondaryAnalyses: { scope: "Original", segments: ["overall", "regionCode"] }
  };
  const revised = planWithCurrentQuestionCoverage(initial, questions, "0.3.0", "sha123");
  assert.deepEqual(revised.primaryOutcomes, initial.primaryOutcomes);
  assert.deepEqual(revised.exploratoryAnalyses, initial.exploratoryAnalyses);
  assert.equal((revised.secondaryAnalyses as { scope: string }).scope, "Original");
  assert.equal((revised.questionnaireCoverage as { questionCount: number }).questionCount, 9);
  assert.equal(questionCoverageIsCurrent(revised, questions, "0.3.0", "sha123"), true);
  assert.deepEqual(planWithCurrentQuestionCoverage(revised, questions, "0.3.0", "sha123"), revised);
  assert.equal(questionCoverageIsCurrent(revised, questions, "0.3.0", "changed-instrument"), false);
});

test("text and experimental items are flagged for a registered protocol, not fake computed metrics", () => {
  const extra: ResearchQuestion[] = [
    { id: "tx", code: "Q28", sectionCode: "H", position: 28, type: "text", required: false, prompt: "Why?", analysisKey: "open_answer", config: {} },
    { id: "ex", code: "Q29", sectionCode: "H", position: 29, type: "experiment", required: false, prompt: "Choice", analysisKey: "choice_task", config: {} }
  ];
  const measures = questionEvaluationMeasures([...questions, ...extra]);
  assert.deepEqual(measures.slice(-2).map((m) => m.metricKeys), [[], []]);
  assert.deepEqual(measures.slice(-2).map((m) => m.classification), [
    "qualitative_protocol_required", "experiment_protocol_required"
  ]);
});

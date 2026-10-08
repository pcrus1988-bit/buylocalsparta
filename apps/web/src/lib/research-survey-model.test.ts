import assert from "node:assert/strict";
import test from "node:test";
import {
  digitalReadinessBand,
  greekRetailBusinessConfidence,
  greekRetailRevenueUpProfitDown,
  researchQuestionApplicable,
  researchQualitySignals,
  scoreGreekRetail2026,
  validateResearchAnswers,
  type ResearchQuestion
} from "./research-survey-model.ts";

test("scores a fully digital retailer at 100 readiness", () => {
  const capabilities = Object.fromEntries([
    "catalog","stock","stock_sync","payments","orders","tracking","tax","reporting","crm"
  ].map((key) => [key, "yes"]));
  const score = scoreGreekRetail2026({
    Q03: ["own_eshop", "marketplace", "social"],
    Q04: "76_100",
    Q05: capabilities,
    Q06: "realtime"
  });
  assert.equal(score.digitalReadinessScore, 100);
  assert.equal(digitalReadinessBand(score.digitalReadinessScore ?? 0), "Digitally Integrated");
});

test("normalizes operational friction from 1-5 to 0-100", () => {
  const score = scoreGreekRetail2026({
    Q07: {
      catalog: "5", content: "5", stock: "5", pricing: "5", tech: "5",
      acquisition: "5", platform_cost: "5",
      payments: "5", logistics: "5", returns: "5", admin: "5"
    }
  });
  assert.equal(score.frictionOverallScore, 100);
  assert.deepEqual(score.frictionDimensions, { catalogue: 100, growth: 100, operations: 100 });
});

test("ignores not-applicable friction items instead of turning them into zero", () => {
  const score = scoreGreekRetail2026({
    Q07: { catalog: "1", content: "na", stock: "5" }
  });
  assert.equal(score.frictionOverallScore, 50);
  assert.equal(score.frictionDimensions.catalogue, 50);
});

test("enforces required matrix completeness and multi-select limits", () => {
  const questions: ResearchQuestion[] = [
    {
      id: "q1", code: "Q01", sectionCode: "A", position: 1, type: "matrix",
      prompt: "Matrix", required: true, analysisKey: "matrix",
      config: { items: [["a","A"],["b","B"]], scale: [["1","1"],["2","2"]] }
    },
    {
      id: "q2", code: "Q02", sectionCode: "A", position: 2, type: "multi",
      prompt: "Multi", required: true, analysisKey: "multi",
      config: { max: 2, options: [["a","A"],["b","B"],["c","C"]] }
    }
  ];
  const result = validateResearchAnswers(questions, {
    Q01: { a: "1" },
    Q02: ["a","b","c"]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["Q01"]);
  assert.deepEqual(result.invalid, ["Q02"]);
});

test("readiness bands stay stable at documented boundaries", () => {
  assert.equal(digitalReadinessBand(20), "Mostly Offline");
  assert.equal(digitalReadinessBand(21), "Digitally Visible");
  assert.equal(digitalReadinessBand(40), "Digitally Visible");
  assert.equal(digitalReadinessBand(41), "Digitally Selling");
  assert.equal(digitalReadinessBand(60), "Digitally Selling");
  assert.equal(digitalReadinessBand(61), "Omnichannel");
  assert.equal(digitalReadinessBand(80), "Omnichannel");
  assert.equal(digitalReadinessBand(81), "Digitally Integrated");
});


test("none is exclusive in multi-select questions", () => {
  const question: ResearchQuestion = {
    id: "q-none", code: "Q03", sectionCode: "A", position: 3, type: "multi",
    prompt: "Channels", required: true, analysisKey: "sales_channels",
    config: { options: [["physical","Physical"],["none","None"]] }
  };
  const result = validateResearchAnswers([question], { Q03: ["physical", "none"] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid, ["Q03"]);
});

test("quality signals flag deterministic cross-question contradictions for review", () => {
  const result = researchQualitySignals({
    Q03: ["physical"],
    Q04: "26_50",
    Q13: "current"
  }, 240);
  assert.equal(result.review, true);
  assert.ok(result.reasonCodes.includes("digital_share_channel_mismatch"));
  assert.ok(result.reasonCodes.includes("marketplace_status_mismatch"));
  assert.ok(!result.reasonCodes.includes("rapid_completion"));
});

test("quality signals flag repeated matrix straightlining but never auto-exclude", () => {
  const repeated = Object.fromEntries(["a","b","c","d","e"].map((key) => [key, "5"]));
  const result = researchQualitySignals({
    Q07: repeated,
    Q14: repeated,
    Q15: repeated
  }, 300);
  assert.equal(result.review, true);
  assert.ok(result.reasonCodes.includes("multi_matrix_straightline"));
  assert.equal((result.metrics as Record<string, unknown>).durationSeconds, 300);
});

test("quality signals retain the rapid-completion review rule", () => {
  const result = researchQualitySignals({}, 45);
  assert.equal(result.review, true);
  assert.deepEqual(result.reasonCodes, ["rapid_completion"]);
});

test("quality score quantifies deterministic review signals without auto-excluding", () => {
  const result = researchQualitySignals({
    Q03: ["physical"],
    Q04: "26_50",
    Q05: { stock: "no", stock_sync: "yes", catalog: "no", payments: "no", orders: "no", tracking: "no" },
    Q06: "daily",
    Q18: "asdf"
  }, 45);
  assert.equal(result.review, true);
  assert.ok(result.score >= 0 && result.score < 50);
  assert.ok(result.reasonCodes.includes("capability_hierarchy_mismatch"));
  assert.ok(result.reasonCodes.includes("open_text_garbage"));
  assert.ok(result.reasonCodes.includes("rapid_completion"));
});

test("quality signals flag repetitive open text but preserve plausible short answers", () => {
  const garbage = researchQualitySignals({ Q18: "aaaaaaaaaaaa" }, 240);
  assert.ok(garbage.reasonCodes.includes("open_text_garbage"));
  const plausible = researchQualitySignals({ Q18: "Γραφειοκρατία" }, 240);
  assert.equal(plausible.review, false);
  assert.equal(plausible.score, 100);
});

test("conditional blocks are hidden and not required outside their routing branch", () => {
  const question: ResearchQuestion = {
    id: "offline", code: "Q24", sectionCode: "H", position: 24,
    type: "multi", prompt: "First online sale", required: true, analysisKey: "first_sale_barriers",
    config: { showIf: { questionCode: "Q03", noneOf: ["own_eshop","marketplace","social"] }, options: [["cost","Cost"],["none","None"]] }
  };
  assert.equal(researchQuestionApplicable(question, { Q03: ["physical"] }), true);
  assert.equal(researchQuestionApplicable(question, { Q03: ["physical","own_eshop"] }), false);
  assert.deepEqual(validateResearchAnswers([question], { Q03: ["physical","own_eshop"] }).missing, []);
  assert.deepEqual(validateResearchAnswers([question], { Q03: ["physical"] }).missing, ["Q24"]);
});

test("business confidence is a transparent three-item score with minimum evidence", () => {
  assert.equal(greekRetailBusinessConfidence({ Q20: 10, Q17: "up_large", Q21: "up_large" }), 100);
  assert.equal(greekRetailBusinessConfidence({ Q20: 0, Q17: "down_large", Q21: "down_large" }), 0);
  assert.equal(greekRetailBusinessConfidence({ Q20: 5, Q17: "stable", Q21: "stable" }), 50);
  assert.equal(greekRetailBusinessConfidence({ Q20: 5 }), undefined);
  assert.equal(greekRetailBusinessConfidence({ Q20: 11, Q17: "unknown" }), undefined);
});

test("revenue and profit divergence requires both valid observed trends", () => {
  assert.equal(greekRetailRevenueUpProfitDown({ Q19: { turnover: "up_small", profitability: "down_large" } }), true);
  assert.equal(greekRetailRevenueUpProfitDown({ Q19: { turnover: "stable", profitability: "down_small" } }), false);
  assert.equal(greekRetailRevenueUpProfitDown({ Q19: { turnover: "up_small", profitability: "unknown" } }), undefined);
});

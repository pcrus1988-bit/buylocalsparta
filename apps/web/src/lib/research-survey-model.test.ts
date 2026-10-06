import assert from "node:assert/strict";
import test from "node:test";
import {
  digitalReadinessBand,
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
  assert.ok(result.qualityScore < 100);
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
  assert.equal(result.qualityScore, 70);
});

test("quality signals flag digital-system and acquisition contradictions without auto-exclusion", () => {
  const result = researchQualitySignals({
    Q03: ["physical"],
    Q05: { catalog: "yes", stock_sync: "yes" },
    Q06: "none",
    Q09: ["marketplace"],
    Q13: "never"
  }, 300);
  assert.equal(result.review, true);
  assert.ok(result.reasonCodes.includes("digital_system_capability_mismatch"));
  assert.ok(result.reasonCodes.includes("marketplace_acquisition_experience_mismatch"));
  assert.ok(result.qualityScore < 100);
});

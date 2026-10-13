import assert from "node:assert/strict";
import test from "node:test";
import {
  barometerScoreEligible, buildLiveBarometer, type BarometerQuestion, type BarometerObservation
} from "./research-live-barometer-core.ts";

const question = (code: string, type: string, config: Record<string, unknown> = {}): BarometerQuestion =>
  ({ code, type, prompt: "Question " + code, section: "A", config });

test("distributions use answering respondents as denominator and count each multi selection once", () => {
  const questions = [
    question("Q01", "single", { options: [["yes", "Ναι"], ["no", "Όχι"]] }),
    question("Q02", "multi", { options: [["a", "A"], ["b", "B"]] })
  ];
  const observations: BarometerObservation[] = Array.from({ length: 5 }, (_, i) => ({
    id: String(i), startedAt: "2026-10-13T00:00:00Z",
    answers: { Q01: i < 3 ? "yes" : "no", Q02: i === 0 ? ["a", "a", "b"] : ["a"] }
  }));
  const result = buildLiveBarometer(questions, observations);
  assert.equal(result.questions[0]?.base, 5);
  assert.equal(result.questions[0]?.categories[0]?.count, 3);
  assert.equal(result.questions[0]?.categories[0]?.percent, 60);
  assert.equal(result.questions[1]?.base, 5);
  assert.deepEqual(result.questions[1]?.categories.map(x => x.count), [5, 1]);
  assert.deepEqual(result.questions[1]?.categories.map(x => x.percent), [100, 20]);
});

test("small bases, open text, and experiments do not leak raw answers", () => {
  const questions = [
    question("Q01", "single", { options: [["a", "A"]] }),
    question("Q18", "text"),
    question("QEXP", "experiment")
  ];
  const observations = [{
    id: "1", startedAt: "2026-10-13T00:00:00Z",
    answers: { Q01: "a", Q18: "SENSITIVE_PERSONAL_TEXT", QEXP: { secret: "SENSITIVE_EXPERIMENT" } }
  }];
  const result = buildLiveBarometer(questions, observations);
  assert.equal(result.questions[0]?.categories.length, 0);
  assert.equal(result.questions[1]?.categories.length, 0);
  assert.equal(result.questions[2]?.categories.length, 0);
  assert.ok(!JSON.stringify(result).includes("SENSITIVE"));
});

test("matrix distributions have separate valid-answer bases per item", () => {
  const questions = [question("Q07", "matrix", {
    items: [["stock", "Stock"], ["cost", "Cost"]],
    scale: [["1", "Low"], ["5", "High"]]
  })];
  const observations = Array.from({ length: 5 }, (_, i) => ({
    id: String(i), startedAt: "2026-10-13T00:00:00Z",
    answers: { Q07: { stock: "5", ...(i < 2 ? { cost: "1" } : {}) } }
  }));
  const result = buildLiveBarometer(questions, observations);
  assert.equal(result.questions[0]?.matrix?.[0]?.base, 5);
  assert.equal(result.questions[0]?.matrix?.[0]?.categories[0]?.percent, 100);
  assert.equal(result.questions[0]?.matrix?.[1]?.base, 2);
  assert.equal(result.questions[0]?.matrix?.[1]?.categories.length, 0);
});

test("indices require item coverage and the approved v1 score, no imputations", () => {
  const digitalItems = ["catalog", "content", "stock", "pricing", "tech", "payments", "logistics", "reporting", "crm"];
  const frictionItems = ["catalog", "content", "stock", "pricing", "tech", "acquisition", "platform_cost", "payments", "logistics", "returns", "admin"];
  const questions = [
    question("Q05", "matrix", { items: digitalItems.map(k => [k, k]), scale: [["yes","Yes"], ["partial","Partial"], ["no","No"]] }),
    question("Q07", "matrix", { items: frictionItems.map(k => [k, k]), scale: [["1","Low"], ["5","High"]] })
  ];
  const partial = { Q03: ["own_eshop"], Q04: "76_100", Q06: "daily", Q05: { catalog: "yes" }, Q07: { catalog: "5" } };
  const eligible = barometerScoreEligible(partial, questions);
  assert.equal(eligible.digital, false);
  assert.equal(eligible.friction, false);
  const complete = {
    Q03: ["own_eshop", "marketplace", "social"], Q04: "76_100", Q06: "realtime",
    Q05: Object.fromEntries(digitalItems.map(k => [k, "yes"])),
    Q07: Object.fromEntries(frictionItems.map(k => [k, "5"])),
    Q17: "up_large", Q19: "very_optimistic", Q20: "very_likely"
  };
  const observations = Array.from({ length: 10 }, (_, i) =>
    ({ id: String(i), startedAt: "2026-10-13T00:00:00Z", answers: complete }));
  const result = buildLiveBarometer(questions, observations);
  assert.deepEqual(result.indicators.map(i => i.average), [100, 100, 100]);
  assert.deepEqual(result.indicators.map(i => i.n), [10, 10, 10]);
  const smaller = buildLiveBarometer(questions, observations.slice(0, 9));
  assert.ok(smaller.indicators.every(i => i.average === undefined));
});

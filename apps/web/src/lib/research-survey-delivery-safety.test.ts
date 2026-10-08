import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateResearchDeliverySafety, graduatedResearchStopRate } from "./research-survey-delivery-safety.ts";

test("early campaign stop thresholds graduate with independently observed outcomes", () => {
  assert.equal(graduatedResearchStopRate(0), null);
  assert.equal(graduatedResearchStopRate(19), null);
  assert.equal(graduatedResearchStopRate(20), 0.20);
  assert.equal(graduatedResearchStopRate(99), 0.20);
  assert.equal(graduatedResearchStopRate(100), 0.08);
  assert.equal(graduatedResearchStopRate(499), 0.08);
  assert.equal(graduatedResearchStopRate(500), 0.05);
  assert.equal(graduatedResearchStopRate(10000), 0.05);
});

test("current Main sample (101 delivered, six true bounces, two validation suppressions) warns but does not stop", () => {
  const decision = evaluateResearchDeliverySafety({
    delivered: 101,
    hardBounced: 6,
    validationSuppressed: 2,
    decided: 109
  });
  assert.equal(decision.hardBounceThreshold, 0.08);
  assert.equal(decision.hardBounceHold, false);
  assert.equal(decision.validationHold, false);
  assert.equal(decision.earlyWarning, true);
});

test("20% emergency stop remains for very early, but not tiny samples", () => {
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 0, hardBounced: 19, validationSuppressed: 0, decided: 19
  }).hardBounceHold, false);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 16, hardBounced: 4, validationSuppressed: 0, decided: 20
  }).hardBounceHold, true);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 81, hardBounced: 19, validationSuppressed: 0, decided: 100
  }).hardBounceHold, true);
});

test("8% intermediate and 5% mature stops remain binding", () => {
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 92, hardBounced: 8, validationSuppressed: 0, decided: 100
  }).hardBounceHold, true);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 473, hardBounced: 26, validationSuppressed: 0, decided: 499
  }).hardBounceHold, false);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 475, hardBounced: 25, validationSuppressed: 0, decided: 500
  }).hardBounceHold, true);
});

test("validation suppressions are not counted as genuine SES bounces", () => {
  const decision = evaluateResearchDeliverySafety({
    delivered: 480, hardBounced: 0, validationSuppressed: 20, decided: 500
  });
  assert.equal(decision.hardBounceHold, false);
  assert.equal(decision.validationHold, false);
  const hold = evaluateResearchDeliverySafety({
    delivered: 475, hardBounced: 0, validationSuppressed: 25, decided: 500
  });
  assert.equal(hold.hardBounceHold, false);
  assert.equal(hold.validationHold, true);
});

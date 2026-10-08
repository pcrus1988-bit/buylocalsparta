import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateResearchDeliverySafety, graduatedResearchStopRate, researchDeliveryReviewMilestones } from "./research-survey-delivery-safety.ts";

test("early campaign stop thresholds graduate with independently observed outcomes", () => {
  assert.equal(graduatedResearchStopRate(0), null);
  assert.equal(graduatedResearchStopRate(19), null);
  assert.equal(graduatedResearchStopRate(20), 0.20);
  assert.equal(graduatedResearchStopRate(99), 0.20);
  assert.equal(graduatedResearchStopRate(100), 0.08);
  assert.equal(graduatedResearchStopRate(499), 0.08);
  assert.equal(graduatedResearchStopRate(500), 0.08);
  assert.equal(graduatedResearchStopRate(999), 0.08);
  assert.equal(graduatedResearchStopRate(1000), 0.05);
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

test("8% interim through 999 and 5% mature stop from 1000", () => {
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 92, hardBounced: 8, validationSuppressed: 0, decided: 100
  }).hardBounceHold, true);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 925, hardBounced: 74, validationSuppressed: 0, decided: 999
  }).hardBounceHold, false);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 920, hardBounced: 80, validationSuppressed: 0, decided: 1000
  }).hardBounceHold, true);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 950, hardBounced: 50, validationSuppressed: 0, decided: 1000
  }).hardBounceHold, true);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 951, hardBounced: 49, validationSuppressed: 0, decided: 1000
  }).hardBounceHold, false);
});

test("validation suppressions are not counted as genuine SES bounces", () => {
  const decision = evaluateResearchDeliverySafety({
    delivered: 960, hardBounced: 0, validationSuppressed: 40, decided: 1000
  });
  assert.equal(decision.hardBounceHold, false);
  assert.equal(decision.validationHold, false);
  const hold = evaluateResearchDeliverySafety({
    delivered: 950, hardBounced: 0, validationSuppressed: 50, decided: 1000
  });
  assert.equal(hold.hardBounceHold, false);
  assert.equal(hold.validationHold, true);
});

test("monitoring checkpoints are at 1000, 5000, 10000, then each additional 10000", () => {
  assert.deepEqual(researchDeliveryReviewMilestones(0), {completedMilestone:null,nextMilestone:1000});
  assert.deepEqual(researchDeliveryReviewMilestones(999), {completedMilestone:null,nextMilestone:1000});
  assert.deepEqual(researchDeliveryReviewMilestones(1000), {completedMilestone:1000,nextMilestone:5000});
  assert.deepEqual(researchDeliveryReviewMilestones(4999), {completedMilestone:1000,nextMilestone:5000});
  assert.deepEqual(researchDeliveryReviewMilestones(5000), {completedMilestone:5000,nextMilestone:10000});
  assert.deepEqual(researchDeliveryReviewMilestones(10000), {completedMilestone:10000,nextMilestone:20000});
  assert.deepEqual(researchDeliveryReviewMilestones(19999), {completedMilestone:10000,nextMilestone:20000});
  assert.deepEqual(researchDeliveryReviewMilestones(20000), {completedMilestone:20000,nextMilestone:30000});
  assert.deepEqual(researchDeliveryReviewMilestones(101500), {completedMilestone:100000,nextMilestone:110000});
});

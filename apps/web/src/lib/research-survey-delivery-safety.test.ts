import assert from "node:assert/strict";
import { test } from "node:test";
import { allowIsolatedResearchSubmissionFailure, evaluateResearchDeliverySafety, graduatedResearchHardBounceStopRate, graduatedResearchStopRate, invalidResearchRecipientAddressReason, researchDeliveryReviewMilestones } from "./research-survey-delivery-safety.ts";

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
  // Separate validation-suppression threshold never changes.
  for (const n of [1000, 4999, 5000, 9999, 10000, 24999, 25000, 50000, 100000]) {
    assert.equal(graduatedResearchStopRate(n), 0.05);
  }
});

test("main research hard-bounce stop stages are exact at every boundary", () => {
  const cases: Array<[number, number | null]> = [
    [0, null], [19, null], [20, 0.20], [99, 0.20],
    [100, 0.08], [999, 0.08],
    [1000, 0.10], [4999, 0.10],
    [5000, 0.09], [9999, 0.09],
    [10000, 0.07], [24999, 0.07],
    [25000, 0.05], [49999, 0.05],
    [50000, 0.05], [182852, 0.05]
  ];
  for (const [n, expected] of cases) assert.equal(graduatedResearchHardBounceStopRate(n), expected, String(n));
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

test("8% through 999, then staged hard-bounce stops and independent validation hold", () => {
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 92, hardBounced: 8, validationSuppressed: 0, decided: 100
  }).hardBounceHold, true);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 925, hardBounced: 74, validationSuppressed: 0, decided: 999
  }).hardBounceHold, false);
  const at1000 = evaluateResearchDeliverySafety({
    delivered: 920, hardBounced: 80, validationSuppressed: 0, decided: 1000
  });
  assert.equal(at1000.hardBounceHold, false);
  assert.equal(at1000.hardBounceThreshold, 0.10);
  assert.equal(at1000.earlyWarning, true);
  const at1000Limit = evaluateResearchDeliverySafety({
    delivered: 900, hardBounced: 100, validationSuppressed: 0, decided: 1000
  });
  assert.equal(at1000Limit.hardBounceHold, true);
  assert.equal(evaluateResearchDeliverySafety({
    delivered: 950, hardBounced: 50, validationSuppressed: 0, decided: 1000
  }).hardBounceHold, false);
  const validationAt1000 = evaluateResearchDeliverySafety({
    delivered: 950, hardBounced: 50, validationSuppressed: 50, decided: 1050
  });
  assert.equal(validationAt1000.validationHold, false);
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
  assert.deepEqual(researchDeliveryReviewMilestones(10000), {completedMilestone:10000,nextMilestone:25000});
  assert.deepEqual(researchDeliveryReviewMilestones(19999), {completedMilestone:10000,nextMilestone:25000});
  assert.deepEqual(researchDeliveryReviewMilestones(24999), {completedMilestone:10000,nextMilestone:25000});
  assert.deepEqual(researchDeliveryReviewMilestones(25000), {completedMilestone:25000,nextMilestone:50000});
  assert.deepEqual(researchDeliveryReviewMilestones(49999), {completedMilestone:25000,nextMilestone:50000});
  assert.deepEqual(researchDeliveryReviewMilestones(50000), {completedMilestone:50000,nextMilestone:60000});
  assert.deepEqual(researchDeliveryReviewMilestones(101500), {completedMilestone:100000,nextMilestone:110000});
});

test("one isolated SES submission rejection is audited but does not strand the approved cohort", () => {
  assert.equal(allowIsolatedResearchSubmissionFailure({
    continuous:true,batchFailures:1,postAcceptanceFailures:0,
    previousFailures:0,processedAfterBatch:310
  }),true);
  assert.equal(allowIsolatedResearchSubmissionFailure({
    continuous:true,batchFailures:2,postAcceptanceFailures:0,
    previousFailures:0,processedAfterBatch:310
  }),false);
  assert.equal(allowIsolatedResearchSubmissionFailure({
    continuous:false,batchFailures:1,postAcceptanceFailures:0,
    previousFailures:0,processedAfterBatch:310
  }),false);
  assert.equal(allowIsolatedResearchSubmissionFailure({
    continuous:true,batchFailures:1,postAcceptanceFailures:1,
    previousFailures:0,processedAfterBatch:310
  }),false);
  assert.equal(allowIsolatedResearchSubmissionFailure({
    continuous:true,batchFailures:1,postAcceptanceFailures:0,
    previousFailures:4,processedAfterBatch:310
  }),false);
  assert.equal(allowIsolatedResearchSubmissionFailure({
    continuous:true,batchFailures:1,postAcceptanceFailures:0,
    previousFailures:2,processedAfterBatch:310
  }),true);
  assert.equal(allowIsolatedResearchSubmissionFailure({
    continuous:true,batchFailures:1,postAcceptanceFailures:0,
    previousFailures:1,processedAfterBatch:50
  }),false);
});

test("single research mailbox validation rejects control, whitespace and semicolon-separated source values", () => {
  const ok = [
    "hello@example.gr",
    "research+cohort-a@kontamou.site",
    "x_y.z@sub.example.com",
    "a!b@example.org"
  ];
  for (const address of ok) assert.equal(invalidResearchRecipientAddressReason(address), null, address);
  const bad = [
    "", "unknown", "test@sample", "hello @example.gr",
    "foo@exa mple.gr", "foo@site.gr;bar@site.gr",
    "foo@site.gr,bar@site.gr", "Foo Name <foo@site.gr>",
    "foo\t@site.gr", "foo\n@site.gr", "foo\r@site.gr",
    "foo..bar@example.gr", ".foo@example.gr", "foo.@example.gr",
    "foo@@example.gr", "foo@-example.gr",
    "foo@example..gr", "foo@exämple.gr", "δοκιμή@example.gr",
    "foo@example.gr ", " foo@example.gr",
    "foo@example.gr\u0000"
  ];
  for (const address of bad) {
    assert.notEqual(invalidResearchRecipientAddressReason(address), null, JSON.stringify(address));
  }
  assert.equal(invalidResearchRecipientAddressReason("foo@site.gr;bar@site.gr"), "multiple_or_formatted_addresses");
  assert.equal(invalidResearchRecipientAddressReason("foo\t@site.gr"), "whitespace_control_or_non_ascii");
});

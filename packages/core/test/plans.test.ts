import test from "node:test";
import assert from "node:assert/strict";
import { PlanService, launchPlanDefinitions } from "../src/plans/index.ts";

test("founding plan is a fixed 36-month entitlement with zero platform sales service fee", () => {
  const effectiveFrom = Date.UTC(2026, 7, 14, 9, 0, 0);
  const service = new PlanService();
  for (const plan of launchPlanDefinitions(effectiveFrom)) service.register(plan);
  const subscription = service.activate({ vendorId: "vendor-1", planCode: "founding_2026", now: effectiveFrom });
  assert.equal(subscription.priceSnapshot?.minor, 150_000);
  assert.equal(subscription.salesServiceFeeBpsSnapshot, 0);
  assert.equal(new Date(subscription.endsAt!).toISOString(), "2029-08-14T09:00:00.000Z");
  assert.equal(subscription.entitlementsSnapshot.standardFeaturesDuringTerm, true);
  assert.equal(subscription.externalCostsPassThrough, true);
});

test("draft standard commercial terms cannot be subscribed and active subscription is a versioned snapshot", () => {
  const now = Date.UTC(2026, 7, 14);
  const service = new PlanService();
  for (const plan of launchPlanDefinitions(now)) service.register(plan);
  assert.throws(() => service.activate({ vendorId: "vendor-1", planCode: "standard", now }), /not active/);
  const founding = service.activate({ vendorId: "vendor-1", planCode: "founding_2026", now });
  service.register({ ...launchPlanDefinitions(now)[1], version: 2, salesServiceFeeBps: 250, effectiveFrom: now + 1 });
  assert.equal(service.salesServiceFeeBps("vendor-1", now + 10), 0);
  assert.equal(service.currentForVendor("vendor-1", now + 10)?.planVersion, founding.planVersion);
});

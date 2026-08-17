import test from "node:test";
import assert from "node:assert/strict";
import { FairVendorExposureEngine, type EligibleOffer } from "../src/index.ts";

function offer(vendorId: string, variantId = "variant-airpods", overrides: Partial<EligibleOffer> = {}): EligibleOffer {
  return {
    offerId: `offer-${vendorId}`,
    vendorId,
    locationId: `loc-${vendorId}`,
    canonicalVariantId: variantId,
    marketId: "sparta",
    approved: true,
    vendorActive: true,
    locationActive: true,
    productAllowed: true,
    availableToSell: 100000,
    stockFresh: true,
    canServe: true,
    costWithinCeiling: true,
    capacityOpen: true,
    capacityWeight: 1,
    fulfilmentMode: "pickup",
    fulfilmentFit: 0,
    stockConfirmedAt: 1_000_000,
    ...overrides
  };
}

test("fairness stays statistically balanced over 30,000 qualified selections", () => {
  const engine = new FairVendorExposureEngine({ warmStartCredit: 0 });
  const offers = [offer("A"), offer("B"), offer("C")];
  for (let i = 0; i < 30_000; i += 1) {
    engine.select({
      marketId: "sparta",
      canonicalVariantId: "variant-airpods",
      visitorKey: `visitor-${i}`,
      postcode: "23100",
      desiredFulfilment: "pickup",
      now: 1_000_000 + i,
      reason: "search_card"
    }, offers);
  }
  const snapshot = engine.snapshot({ marketId: "sparta", canonicalVariantId: "variant-airpods" });
  assert.equal(snapshot.selections, 30_000);
  assert.ok(Math.max(...Object.values(snapshot.exposures)) - Math.min(...Object.values(snapshot.exposures)) <= 1);
});

test("sticky assignment is reused without a second fairness selection", () => {
  const engine = new FairVendorExposureEngine();
  const offers = [offer("A"), offer("B")];
  const context = {
    marketId: "sparta",
    canonicalVariantId: "variant-airpods",
    visitorKey: "visitor-1",
    postcode: "23100",
    desiredFulfilment: "pickup" as const,
    now: 2_000_000,
    reason: "product_view" as const
  };
  const first = engine.select(context, offers);
  const second = engine.select({ ...context, now: context.now + 1_000 }, offers);
  assert.equal(second.vendorId, first.vendorId);
  assert.equal(second.reusedStickyAssignment, true);
  assert.equal(engine.snapshot({ marketId: "sparta", canonicalVariantId: "variant-airpods" }).selections, 1);
});

test("ineligible offer never participates", () => {
  const engine = new FairVendorExposureEngine();
  const offers = [offer("A", undefined, { availableToSell: 0 }), offer("B")];
  const selected = engine.select({
    marketId: "sparta",
    canonicalVariantId: "variant-airpods",
    visitorKey: "visitor-x",
    postcode: "23100",
    desiredFulfilment: "pickup",
    now: 2_000_000,
    reason: "product_view"
  }, offers);
  assert.equal(selected.vendorId, "B");
});

test("eligibility explanation exposes exact remediation reasons", () => {
  const engine = new FairVendorExposureEngine();
  const decision = engine.evaluateEligibility(offer("A", undefined, { availableToSell: 0, stockFresh: false, capacityOpen: false }));
  assert.equal(decision.eligible, false);
  assert.deepEqual(decision.reasons.sort(), ["capacity_closed", "out_of_stock", "stock_stale"].sort());
});

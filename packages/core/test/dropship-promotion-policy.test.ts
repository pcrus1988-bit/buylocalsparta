import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDropshipPromotion } from "../../../integrations/dropship-suppliers/src/promotion-policy.ts";

test("controlled dropship promotion maps cost, retail and MSRP into structured pricing", () => {
  const result = evaluateDropshipPromotion({
    supplierAvailable: true,
    supplierCostMinor: 5_500,
    retailPriceMinor: 7_900,
    msrpMinor: 9_900,
    showMsrp: true
  });

  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockReasons, []);
  assert.equal(result.grossMarginMinor, 2_400);
  assert.equal(result.grossMarginBps, 3_038);
  assert.deepEqual(result.structuredPricing, {
    customerPriceMinor: 7_900,
    msrpMinor: 9_900,
    showMsrp: true,
    privatePricing: {
      buyingPriceMinor: 5_500,
      pricingMode: "manual"
    }
  });
});

test("supplier API unavailability blocks promotion even when pricing is complete", () => {
  const result = evaluateDropshipPromotion({
    supplierAvailable: false,
    supplierCostMinor: 5_500,
    retailPriceMinor: 7_900
  });

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["supplier-unavailable"]);
  assert.equal(result.structuredPricing, null);
});

test("a staged supplier product cannot become sellable without an explicit retail price", () => {
  const result = evaluateDropshipPromotion({
    supplierAvailable: true,
    supplierCostMinor: 5_500,
    retailPriceMinor: null,
    msrpMinor: 9_900
  });

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["retail-price-missing-or-invalid"]);
  assert.equal(result.structuredPricing, null);
});

test("promotion rejects a retail price below the private supplier buying cost", () => {
  const result = evaluateDropshipPromotion({
    supplierAvailable: true,
    supplierCostMinor: 8_000,
    retailPriceMinor: 7_900
  });

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["retail-price-below-supplier-cost"]);
  assert.equal(result.grossMarginMinor, -100);
  assert.equal(result.structuredPricing, null);
});

test("MSRP can only be made public when a valid MSRP value is present", () => {
  const result = evaluateDropshipPromotion({
    supplierAvailable: true,
    supplierCostMinor: 5_500,
    retailPriceMinor: 7_900,
    msrpMinor: null,
    showMsrp: true
  });

  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockReasons, ["msrp-required-for-display"]);
  assert.equal(result.structuredPricing, null);
});

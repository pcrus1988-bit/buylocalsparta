import assert from "node:assert/strict";
import test from "node:test";
import {
  KONTA_MOU_DROPSHIP_VENDOR_ID,
  planDropshipActivation,
  type DropshipActivationCandidate
} from "../../../integrations/dropship-suppliers/src/activation-planner.ts";

function candidate(overrides: Partial<DropshipActivationCandidate> = {}): DropshipActivationCandidate {
  return {
    intent: "supplier_sync",
    supplierLifecycle: "active",
    currentOfferActive: false,
    externalProductId: "nova-product-123",
    externalVariantId: "nova-variant-456",
    supplierAvailable: true,
    supplierCostMinor: 5_500,
    retailPriceMinor: 7_900,
    msrpMinor: 9_900,
    showMsrp: true,
    ...overrides
  };
}

test("supplier synchronization cannot activate an inactive offer", () => {
  const result = planDropshipActivation(candidate());

  assert.equal(result.action, "preserve");
  assert.equal(result.offerActive, false);
  assert.deepEqual(result.blockReasons, ["explicit-promotion-required"]);
  assert.equal(result.structuredPricing, null);
});

test("explicit promotion activates only after controlled commercial checks pass", () => {
  const result = planDropshipActivation(candidate({ intent: "explicit_promotion" }));

  assert.equal(result.action, "activate");
  assert.equal(result.offerActive, true);
  assert.equal(result.commercialVendorId, KONTA_MOU_DROPSHIP_VENDOR_ID);
  assert.deepEqual(result.blockReasons, []);
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

test("invalid commercial pricing rejects explicit promotion", () => {
  const result = planDropshipActivation(candidate({
    intent: "explicit_promotion",
    retailPriceMinor: 5_000
  }));

  assert.equal(result.action, "reject");
  assert.equal(result.offerActive, false);
  assert.deepEqual(result.blockReasons, ["retail-price-below-supplier-cost"]);
  assert.equal(result.structuredPricing, null);
});

test("supplier withdrawal deactivates an already-live offer during synchronization", () => {
  const result = planDropshipActivation(candidate({
    currentOfferActive: true,
    supplierLifecycle: "withdrawn",
    supplierAvailable: false
  }));

  assert.equal(result.action, "deactivate");
  assert.equal(result.offerActive, false);
  assert.deepEqual(result.blockReasons, ["supplier-withdrawn", "supplier-unavailable"]);
  assert.equal(result.structuredPricing, null);
});

test("out-of-stock supplier evidence deactivates an already-live offer", () => {
  const result = planDropshipActivation(candidate({
    currentOfferActive: true,
    supplierAvailable: false
  }));

  assert.equal(result.action, "deactivate");
  assert.equal(result.offerActive, false);
  assert.deepEqual(result.blockReasons, ["supplier-unavailable"]);
});

test("supplier cost increases can deactivate a live offer without changing its public price", () => {
  const result = planDropshipActivation(candidate({
    currentOfferActive: true,
    supplierCostMinor: 8_500,
    retailPriceMinor: 7_900
  }));

  assert.equal(result.action, "deactivate");
  assert.equal(result.offerActive, false);
  assert.deepEqual(result.blockReasons, ["retail-price-below-supplier-cost"]);
  assert.equal(result.structuredPricing, null);
});

test("a resurfaced supplier id remains inactive until explicitly promoted again", () => {
  const result = planDropshipActivation(candidate({
    intent: "supplier_sync",
    supplierLifecycle: "active",
    currentOfferActive: false
  }));

  assert.equal(result.action, "preserve");
  assert.equal(result.offerActive, false);
  assert.deepEqual(result.blockReasons, ["explicit-promotion-required"]);
});

test("raw Nova regular/sale prices can never become the public customer price", () => {
  const withRawSupplierEvidence = {
    ...candidate({ intent: "explicit_promotion", retailPriceMinor: 8_400 }),
    regularPriceRaw: "999.99",
    salePriceRaw: "1.00"
  };

  const result = planDropshipActivation(withRawSupplierEvidence);

  assert.equal(result.action, "activate");
  assert.equal(result.structuredPricing?.customerPriceMinor, 8_400);
  assert.equal("regularPriceRaw" in (result.structuredPricing ?? {}), false);
  assert.equal("salePriceRaw" in (result.structuredPricing ?? {}), false);
});

test("supplier-side identity cannot override the fixed KONTA MOY commercial vendor", () => {
  const withSupplierVendorIdentity = {
    ...candidate({ intent: "explicit_promotion" }),
    supplierVendorId: "nova-vendor-999"
  };

  const result = planDropshipActivation(withSupplierVendorIdentity);

  assert.equal(result.commercialVendorId, "vendor_e8cb57b3c67b469d9a9d");
  assert.notEqual(result.commercialVendorId, withSupplierVendorIdentity.supplierVendorId);
});

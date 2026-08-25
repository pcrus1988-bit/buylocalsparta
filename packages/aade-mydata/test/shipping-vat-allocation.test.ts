import assert from "node:assert/strict";
import test from "node:test";
import { allocateGrossChargeByVatBuckets } from "../src/shipping-vat-allocation.ts";

test("zero shipping needs no VAT allocation", () => {
  assert.deepEqual(allocateGrossChargeByVatBuckets(0, [{ key: "24", grossMinor: 100, vatRateBps: 2400 }]), []);
});

test("single-rate 24% shipping inherits the merchandise rate", () => {
  assert.deepEqual(allocateGrossChargeByVatBuckets(50, [{ key: "24", grossMinor: 100, vatRateBps: 2400 }]), [
    { key: "24", grossMinor: 50, netMinor: 40, vatMinor: 10, vatRateBps: 2400 }
  ]);
});

test("mixed-rate shipping is allocated pro-rata and preserves every cent", () => {
  const allocations = allocateGrossChargeByVatBuckets(50, [
    { key: "24", grossMinor: 100, vatRateBps: 2400 },
    { key: "13", grossMinor: 50, vatRateBps: 1300 }
  ]);
  assert.deepEqual(allocations, [
    { key: "13", grossMinor: 17, netMinor: 15, vatMinor: 2, vatRateBps: 1300 },
    { key: "24", grossMinor: 33, netMinor: 27, vatMinor: 6, vatRateBps: 2400 }
  ]);
  assert.equal(allocations.reduce((sum, row) => sum + row.grossMinor, 0), 50);
});

test("largest-remainder tie breaks deterministically by bucket key", () => {
  const allocations = allocateGrossChargeByVatBuckets(1, [
    { key: "b", grossMinor: 1, vatRateBps: 2400 },
    { key: "a", grossMinor: 1, vatRateBps: 1300 }
  ]);
  assert.deepEqual(allocations, [{ key: "a", grossMinor: 1, netMinor: 1, vatMinor: 0, vatRateBps: 1300 }]);
});

test("duplicate bucket keys combine before allocation", () => {
  assert.deepEqual(allocateGrossChargeByVatBuckets(10, [
    { key: "24", grossMinor: 30, vatRateBps: 2400 },
    { key: "24", grossMinor: 70, vatRateBps: 2400 }
  ]), [{ key: "24", grossMinor: 10, netMinor: 8, vatMinor: 2, vatRateBps: 2400 }]);
});

test("non-zero shipping fails closed without merchandise VAT evidence", () => {
  assert.throws(() => allocateGrossChargeByVatBuckets(50, []), /requires merchandise/);
});

test("conflicting VAT rates under one treatment key fail closed", () => {
  assert.throws(() => allocateGrossChargeByVatBuckets(50, [
    { key: "same", grossMinor: 100, vatRateBps: 2400 },
    { key: "same", grossMinor: 100, vatRateBps: 1300 }
  ]), /conflicting VAT rates/);
});

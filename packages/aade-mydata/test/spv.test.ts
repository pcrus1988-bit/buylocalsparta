import assert from "node:assert/strict";
import test from "node:test";
import { allocateSinglePurposeVoucherRedemption, splitVatInclusiveGross } from "../src/spv.ts";

test("24% SPV issue splits face value into the correct VAT-inclusive amounts", () => {
  assert.deepEqual(splitVatInclusiveGross(4390, 2400), { netMinor: 3540, vatMinor: 850 });
});

test("SPV redemption leaves only the Mollie top-up taxable at redemption", () => {
  const result = allocateSinglePurposeVoucherRedemption([{ lineId: "line-1", grossMinor: 4490, vatRateBps: 2400 }], 4390, 2400);
  assert.equal(result.remainingGrossMinor, 100);
  assert.equal(result.remainingNetMinor, 81);
  assert.equal(result.remainingVatMinor, 19);
  assert.equal(result.allocations[0]?.redemptionMinor, 4390);
});

test("SPV redemption preserves exact minor-unit totals across multiple lines", () => {
  const result = allocateSinglePurposeVoucherRedemption([
    { lineId: "a", grossMinor: 1999, vatRateBps: 2400 },
    { lineId: "b", grossMinor: 2501, vatRateBps: 2400 }
  ], 1001, 2400);
  assert.equal(result.redeemedMinor, 1001);
  assert.equal(result.remainingGrossMinor, 3499);
  assert.equal(result.allocations.reduce((sum, line) => sum + line.redemptionMinor, 0), 1001);
});

test("single-purpose 24% vouchers cannot be used against a different VAT rate", () => {
  assert.throws(
    () => allocateSinglePurposeVoucherRedemption([{ lineId: "reduced", grossMinor: 1000, vatRateBps: 1300 }], 500, 2400),
    /cannot be redeemed/
  );
});

test("full SPV redemption leaves no redemption taxable base", () => {
  const result = allocateSinglePurposeVoucherRedemption([{ lineId: "line-1", grossMinor: 5000, vatRateBps: 2400 }], 5000, 2400);
  assert.equal(result.remainingGrossMinor, 0);
  assert.equal(result.remainingNetMinor, 0);
  assert.equal(result.remainingVatMinor, 0);
});

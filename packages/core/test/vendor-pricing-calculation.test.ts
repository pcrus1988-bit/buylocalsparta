import test from "node:test";
import assert from "node:assert/strict";
import { calculateRetailPriceMinor } from "../../../apps/web/src/lib/vendor-pricing-calculation.ts";

test("structured pricing applies percentage markup then percentage discount", () => {
  assert.equal(calculateRetailPriceMinor({
    buyingPriceMinor: 6000,
    markupType: "percent",
    markupValue: 25,
    discountType: "percent",
    discountValue: 10
  }), 6750);
});

test("structured pricing supports fixed euro markup and discount", () => {
  assert.equal(calculateRetailPriceMinor({
    buyingPriceMinor: 10000,
    markupType: "fixed",
    markupValue: 15.5,
    discountType: "fixed",
    discountValue: 5.25
  }), 11025);
});

test("structured pricing supports mixed adjustment types and cent rounding", () => {
  assert.equal(calculateRetailPriceMinor({
    buyingPriceMinor: 999,
    markupType: "percent",
    markupValue: 12.5,
    discountType: "fixed",
    discountValue: 1.11
  }), 1013);
});

test("one hundred percent discount reaches zero but never negative", () => {
  assert.equal(calculateRetailPriceMinor({
    buyingPriceMinor: 5000,
    discountType: "percent",
    discountValue: 100
  }), 0);
  assert.equal(calculateRetailPriceMinor({
    buyingPriceMinor: 5000,
    discountType: "fixed",
    discountValue: 999
  }), 0);
});

test("invalid pricing inputs are rejected", () => {
  assert.throws(() => calculateRetailPriceMinor({ buyingPriceMinor: -1 }), /τιμή αγοράς/i);
  assert.throws(() => calculateRetailPriceMinor({
    buyingPriceMinor: 1000,
    discountType: "percent",
    discountValue: 101
  }), /0% έως 100%/);
  assert.throws(() => calculateRetailPriceMinor({
    buyingPriceMinor: 1000,
    markupType: "fixed",
    markupValue: -1
  }), /Προσαύξηση/);
});

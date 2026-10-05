import assert from "node:assert/strict";
import test from "node:test";
import { isTryOnGarmentCandidate } from "./try-on-eligibility.ts";

test("Try On Me accepts clothing garments", () => {
  assert.equal(isTryOnGarmentCandidate({
    title: "Midi φόρεμα με ζώνη",
    categoryCode: "dresses",
    departmentCode: "fashion",
    categoryLabel: "Φορέματα"
  }), true);
  assert.equal(isTryOnGarmentCandidate({
    title: "Men's cotton shirt",
    categoryCode: "clothing",
    departmentCode: "fashion",
    categoryLabel: "Shirts"
  }), true);
});

test("Try On Me excludes unsupported wearable categories", () => {
  assert.equal(isTryOnGarmentCandidate({
    title: "Running sneakers",
    categoryCode: "shoes",
    departmentCode: "fashion",
    categoryLabel: "Παπούτσια"
  }), false);
  assert.equal(isTryOnGarmentCandidate({
    title: "Leather handbag",
    categoryCode: "handbags",
    departmentCode: "fashion",
    categoryLabel: "Τσάντες"
  }), false);
});

test("Try On Me does not activate for non-fashion products", () => {
  assert.equal(isTryOnGarmentCandidate({
    title: "Hydrating face serum",
    categoryCode: "skincare",
    departmentCode: "beauty",
    categoryLabel: "Περιποίηση"
  }), false);
});

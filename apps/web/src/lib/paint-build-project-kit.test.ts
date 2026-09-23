import assert from "node:assert/strict";
import test from "node:test";
import { calculateVerifiedPaintQuantity, choosePaintPackPlan, packLitres, PROJECT_ACCESSORY_RULES } from "./paint-build-project-kit.ts";

test("paint-build pack units normalize litres and millilitres", () => {
  assert.equal(packLitres(750, "ml"), 0.75);
  assert.equal(packLitres(3, "L"), 3);
});

test("paint-build pack plan can prefer a lower-cost larger pack over many small packs", () => {
  const plan = choosePaintPackPlan([
    { id: "075", title: "0.75 L", priceMinor: 899, packValue: 0.75, packUnit: "L" },
    { id: "3", title: "3 L", priceMinor: 2399, packValue: 3, packUnit: "L" },
    { id: "10", title: "10 L", priceMinor: 4499, packValue: 10, packUnit: "L" }
  ], 7.2);
  assert.ok(plan);
  assert.deepEqual(plan.lines.map((line) => [line.variant.id, line.quantity]), [["10", 1]]);
  assert.equal(plan.totalLitres, 10);
});

test("paint-build pack plan rejects absurd oversupply when a near-size option exists", () => {
  const plan = choosePaintPackPlan([
    { id: "1", title: "1 L", priceMinor: 800, packValue: 1, packUnit: "L" },
    { id: "10", title: "10 L", priceMinor: 900, packValue: 10, packUnit: "L" }
  ], 1.5);
  assert.equal(plan?.totalLitres, 2);
});

test("accessory quantities are independent from coating litres", () => {
  const roller = PROJECT_ACCESSORY_RULES.find((rule) => rule.key === "paint-roller");
  const tape = PROJECT_ACCESSORY_RULES.find((rule) => rule.key === "masking-tape");
  assert.equal(roller?.quantityForArea(80), 1);
  assert.equal(tape?.quantityForArea(80), 4);
});


test("verified quantity can use explicit VITEX two-coat coverage without inventing a coat count", () => {
  const quantity = calculateVerifiedPaintQuantity({
    areaM2: 28,
    coverageMin: 15,
    coverageMax: 17,
    twoCoatCoverageMin: 8,
    twoCoatCoverageMax: 9
  });
  assert.deepEqual(quantity, {
    min: 3.11,
    max: 3.5,
    coatsMin: 2,
    coatsMax: 2,
    basis: "manufacturer_two_coat_coverage"
  });
});

test("verified quantity still prefers explicit coverage plus explicit coat count", () => {
  const quantity = calculateVerifiedPaintQuantity({
    areaM2: 28,
    coverageMin: 15,
    coverageMax: 17,
    coatsMin: 2,
    coatsMax: 2,
    twoCoatCoverageMin: 8,
    twoCoatCoverageMax: 9
  });
  assert.equal(quantity?.basis, "coverage_and_coats");
  assert.equal(quantity?.min, 3.29);
  assert.equal(quantity?.max, 3.73);
});


test("pack planner respects sellable stock caps", () => {
  const plan = choosePaintPackPlan([
    { id: "one", title: "1 L", priceMinor: 1000, packValue: 1, packUnit: "L", maxUnits: 1 },
    { id: "three", title: "3 L", priceMinor: 2400, packValue: 3, packUnit: "L", maxUnits: 2 }
  ], 4);
  assert.ok(plan);
  assert.deepEqual(plan.lines.map((line) => [line.variant.id, line.quantity]), [["three", 2]]);
  assert.equal(plan.totalLitres, 6);
});

test("pack planner fails closed when current stock cannot cover the verified requirement", () => {
  const plan = choosePaintPackPlan([
    { id: "one", title: "1 L", priceMinor: 1000, packValue: 1, packUnit: "L", maxUnits: 1 },
    { id: "three", title: "3 L", priceMinor: 2400, packValue: 3, packUnit: "L", maxUnits: 0 }
  ], 2);
  assert.equal(plan, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { choosePaintPackPlan, packLitres, PROJECT_ACCESSORY_RULES } from "./paint-build-project-kit.ts";

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

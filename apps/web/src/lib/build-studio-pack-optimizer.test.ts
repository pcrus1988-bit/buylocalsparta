import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudioSelectionGroupKey,
  normalizePackLitres,
  optimizeBuildStudioPacks
} from "./build-studio-pack-optimizer";

test("normalizes litres and millilitres", () => {
  assert.equal(normalizePackLitres(750, "ml"), 0.75);
  assert.equal(normalizePackLitres("3.000", "L"), 3);
});

test("groups an explicit colour across differently worded pack titles", () => {
  assert.equal(
    buildStudioSelectionGroupKey({ title: "Acrylan 750ml white", colourHint: "white" }),
    buildStudioSelectionGroupKey({ title: "Acrylan 10L white", colourHint: "white" })
  );
});

test("removes pack size when deriving a commercial base group", () => {
  assert.equal(
    buildStudioSelectionGroupKey({ title: "Χρώμα μηχανής VITEX Acrylan 3L εξωτερικής χρήσης για μεσαίες" }),
    buildStudioSelectionGroupKey({ title: "Χρώμα μηχανής VITEX Acrylan 10L εξωτερικής χρήσης για μεσαίες" })
  );
});

test("chooses one cheaper 10 L pack for a 7.1 L Acrylan-style requirement", () => {
  const plan = optimizeBuildStudioPacks(7.1, [
    { id: "750", title: "750 ml", priceMinor: 899, packLitres: 0.75, selectionGroupKey: "white" },
    { id: "3", title: "3 L", priceMinor: 2399, packLitres: 3, selectionGroupKey: "white" },
    { id: "10", title: "10 L", priceMinor: 4499, packLitres: 10, selectionGroupKey: "white" }
  ]);
  assert.ok(plan);
  assert.equal(plan.totalPriceMinor, 4499);
  assert.equal(plan.totalPacks, 1);
  assert.deepEqual(plan.lines.map((line) => [line.variantId, line.quantity]), [["10", 1]]);
});

test("does not buy a massively oversized pack when a sensible smaller combination exists", () => {
  const plan = optimizeBuildStudioPacks(1.2, [
    { id: "750", title: "750 ml", priceMinor: 899, packLitres: 0.75, selectionGroupKey: "white" },
    { id: "3", title: "3 L", priceMinor: 2399, packLitres: 3, selectionGroupKey: "white" },
    { id: "10", title: "10 L", priceMinor: 4499, packLitres: 10, selectionGroupKey: "white" }
  ]);
  assert.ok(plan);
  assert.equal(plan.suppliedLitres, 1.5);
  assert.deepEqual(plan.lines.map((line) => [line.variantId, line.quantity]), [["750", 2]]);
});

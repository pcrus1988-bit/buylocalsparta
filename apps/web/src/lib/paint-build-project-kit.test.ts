import { isPaintBuildMainManufacturerProductRole } from "./paint-build-greek-presentation.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateVerifiedMaterialQuantity,
  calculateVerifiedPaintQuantity,
  chooseMaterialPackPlan,
  choosePaintPackPlan,
  extractManufacturerComponentNames,
  packLitres,
  packMaterialAmount,
  PROJECT_ACCESSORY_RULES
} from "./paint-build-project-kit.ts";

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


test("structured manufacturer component evidence resolves one exact primer without losing object values", () => {
  assert.deepEqual(
    extractManufacturerComponentNames(
      { required_primer: "Acrylan Unco Eco" },
      { primer: "Acrylan Unco Eco", surface_state: "new mineral" }
    ),
    ["Acrylan Unco Eco"]
  );
});

test("manufacturer primer alternatives remain choices instead of being guessed", () => {
  assert.deepEqual(
    extractManufacturerComponentNames(
      { primer_options: ["Durovit", "Acrylan Unco Eco"] },
      { options: ["Durovit", "Acrylan Unco Eco"] }
    ),
    ["Durovit", "Acrylan Unco Eco"]
  );
});


test("Paint & Build main candidates reject system-component manufacturer roles", () => {
  assert.equal(isPaintBuildMainManufacturerProductRole("surface preparation primer", "water-based acrylic primer"), false);
  assert.equal(isPaintBuildMainManufacturerProductRole("wood preservative", "exterior preservative"), false);
  assert.equal(isPaintBuildMainManufacturerProductRole("roof waterproofing accessory", "reinforced polyester mesh"), false);
  assert.equal(isPaintBuildMainManufacturerProductRole("interior wall paint", "mat emulsion paint"), true);
  assert.equal(isPaintBuildMainManufacturerProductRole("repair putty", "lightweight acrylic putty"), true);
  assert.equal(isPaintBuildMainManufacturerProductRole("metal paint", "anticorrosive solvent-based paint for chassis and frames"), true);
});


test("paint-build mass packs normalize kilograms and grams without density assumptions", () => {
  assert.equal(packMaterialAmount(5, "kg", "kg"), 5);
  assert.equal(packMaterialAmount(800, "g", "kg"), 0.8);
  assert.equal(packMaterialAmount(1, "L", "kg"), undefined);
});

test("verified material quantity supports manufacturer m²/kg coverage", () => {
  const quantity = calculateVerifiedMaterialQuantity({
    areaM2: 10,
    consumptionMin: 2,
    consumptionMax: 3,
    consumptionUnit: "m²/kg"
  });
  assert.deepEqual(quantity, {
    min: 3.33,
    max: 5,
    unit: "kg",
    basis: "manufacturer_area_per_mass"
  });
});

test("verified material quantity supports direct kg/m² consumption", () => {
  const quantity = calculateVerifiedMaterialQuantity({
    areaM2: 12,
    consumptionMin: 1.2,
    consumptionMax: 1.5,
    consumptionUnit: "kg/m²"
  });
  assert.deepEqual(quantity, {
    min: 14.4,
    max: 18,
    unit: "kg",
    basis: "manufacturer_mass_per_area"
  });
});

test("mass pack planner can combine grams and kilograms", () => {
  const plan = chooseMaterialPackPlan([
    { id: "400g", title: "400 g", priceMinor: 200, packValue: 400, packUnit: "g" },
    { id: "800g", title: "800 g", priceMinor: 350, packValue: 800, packUnit: "g" },
    { id: "5kg", title: "5 kg", priceMinor: 1200, packValue: 5, packUnit: "kg" }
  ], 3.4, "kg");
  assert.ok(plan);
  assert.equal(plan.unit, "kg");
  assert.ok(plan.totalAmount >= 3.4);
  assert.ok(plan.lines.every((line) => line.unit === "kg"));
});

test("material quantity rejects unrecognized units instead of guessing", () => {
  assert.equal(calculateVerifiedMaterialQuantity({
    areaM2: 10,
    consumptionMin: 2,
    consumptionMax: 3,
    consumptionUnit: "kg"
  }), undefined);
});

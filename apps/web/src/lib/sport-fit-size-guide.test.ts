import assert from "node:assert/strict";
import test from "node:test";
import {
  preferredSportSizeGuideScopes,
  resolveMeasuredSportSize,
  type SportSizeGuidePoint
} from "./sport-fit-size-guide.ts";

const points: readonly SportSizeGuidePoint[] = [
  {
    measurementMm: 259,
    labels: [
      { sizeSystem: "EU", audienceScope: "unisex", sizeLabel: "42" },
      { sizeSystem: "UK", audienceScope: "unisex", sizeLabel: "8" },
      { sizeSystem: "US", audienceScope: "men", sizeLabel: "8.5" },
      { sizeSystem: "US", audienceScope: "women", sizeLabel: "9.5" }
    ]
  },
  {
    measurementMm: 263,
    labels: [
      { sizeSystem: "EU", audienceScope: "unisex", sizeLabel: "42 2/3" },
      { sizeSystem: "UK", audienceScope: "unisex", sizeLabel: "8.5" },
      { sizeSystem: "US", audienceScope: "men", sizeLabel: "9" },
      { sizeSystem: "US", audienceScope: "women", sizeLabel: "10" }
    ]
  }
];

test("exact heel-to-toe measurement returns the exact EU chart row", () => {
  const result = resolveMeasuredSportSize(points, 259, "EU", "men");
  assert.equal(result.exact, true);
  assert.equal(result.outOfRange, false);
  assert.deepEqual(result.sizeLabels, ["42"]);
});

test("between-row measurement returns both adjacent sizes instead of guessing", () => {
  const result = resolveMeasuredSportSize(points, 261, "EU", "women");
  assert.equal(result.exact, false);
  assert.equal(result.outOfRange, false);
  assert.equal(result.lowerMeasurementMm, 259);
  assert.equal(result.upperMeasurementMm, 263);
  assert.deepEqual(result.sizeLabels, ["42", "42 2/3"]);
});

test("audience-specific labels outrank unisex fallback for the same system", () => {
  const women = resolveMeasuredSportSize(points, 259, "US", "women");
  const men = resolveMeasuredSportSize(points, 259, "US", "men");
  assert.deepEqual(women.sizeLabels, ["9.5"]);
  assert.deepEqual(men.sizeLabels, ["8.5"]);
});

test("out-of-range measurements do not manufacture a size", () => {
  const result = resolveMeasuredSportSize(points, 250, "EU", "men");
  assert.equal(result.outOfRange, true);
  assert.deepEqual(result.sizeLabels, []);
  assert.equal(result.upperMeasurementMm, 259);
});

test("invalid measurements are rejected", () => {
  assert.throws(() => resolveMeasuredSportSize(points, 0, "EU", "men"), /INVALID_FOOT_MEASUREMENT/);
});


test("kids-specific guide scope outranks unisex fallback", () => {
  assert.deepEqual(
    preferredSportSizeGuideScopes(["unisex", "kids"], "kids"),
    ["kids"]
  );
  assert.deepEqual(
    preferredSportSizeGuideScopes(["unisex", "kids"], "men"),
    ["unisex"]
  );
  assert.deepEqual(
    preferredSportSizeGuideScopes(["unisex"], "kids"),
    []
  );
});

test("an exact audience guide outranks unisex for future audience-specific charts", () => {
  assert.deepEqual(
    preferredSportSizeGuideScopes(["unisex", "women"], "women"),
    ["women"]
  );
  assert.deepEqual(
    preferredSportSizeGuideScopes(["kids"], "men"),
    []
  );
});


test("Saucony unisex chart preserves exact EU, US audience and JPN conversions", () => {
  const sauconyPoints: readonly SportSizeGuidePoint[] = [
    {
      measurementMm: 250,
      labels: [
        { sizeSystem: "EU", audienceScope: "unisex", sizeLabel: "40" },
        { sizeSystem: "UK", audienceScope: "unisex", sizeLabel: "6" },
        { sizeSystem: "US", audienceScope: "men", sizeLabel: "7" },
        { sizeSystem: "US", audienceScope: "women", sizeLabel: "8.5" },
        { sizeSystem: "JPN", audienceScope: "unisex", sizeLabel: "25" }
      ]
    },
    {
      measurementMm: 255,
      labels: [
        { sizeSystem: "EU", audienceScope: "unisex", sizeLabel: "40.5" },
        { sizeSystem: "UK", audienceScope: "unisex", sizeLabel: "6.5" },
        { sizeSystem: "US", audienceScope: "men", sizeLabel: "7.5" },
        { sizeSystem: "US", audienceScope: "women", sizeLabel: "9" },
        { sizeSystem: "JPN", audienceScope: "unisex", sizeLabel: "25.5" }
      ]
    }
  ];

  assert.deepEqual(resolveMeasuredSportSize(sauconyPoints, 250, "EU", "men").sizeLabels, ["40"]);
  assert.deepEqual(resolveMeasuredSportSize(sauconyPoints, 250, "US", "men").sizeLabels, ["7"]);
  assert.deepEqual(resolveMeasuredSportSize(sauconyPoints, 250, "US", "women").sizeLabels, ["8.5"]);
  assert.deepEqual(resolveMeasuredSportSize(sauconyPoints, 250, "JPN", "women").sizeLabels, ["25"]);
  assert.deepEqual(resolveMeasuredSportSize(sauconyPoints, 252, "EU", "women").sizeLabels, ["40", "40.5"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG_COLOR_INDEX, matchProducts, normalizeCatalogColorText, resolveCatalogColor, type ProductIdentity } from "../src/index.ts";

test("color index carries shared display and coding metadata", () => {
  const beige = CATALOG_COLOR_INDEX.find((entry) => entry.key === "beige");
  assert.ok(beige);
  assert.equal(beige.displayNameEl, "Μπεζ");
  assert.equal(beige.displayNameEn, "Beige");
  assert.match(beige.hex, /^#[0-9A-F]{6}$/i);
  assert.equal(beige.ralApprox, "RAL 1001");
});

test("Greek and English color descriptions resolve to one normalized color", () => {
  assert.equal(resolveCatalogColor("Μπεζ")?.key, "beige");
  assert.equal(resolveCatalogColor("Beige")?.key, "beige");
  assert.equal(resolveCatalogColor("Χρώμα: Ροζ")?.key, "pink");
  assert.equal(resolveCatalogColor("Pink / Ροζ")?.key, "pink");
  assert.equal(resolveCatalogColor("Navy Blue")?.key, "navy");
  assert.equal(resolveCatalogColor("Σκούρο Μπλε")?.key, "navy");
});

test("RAL and HEX references can resolve through the same index", () => {
  assert.equal(resolveCatalogColor("RAL 1001")?.key, "beige");
  assert.equal(resolveCatalogColor("#D6C2A6")?.key, "beige");
});

test("resolved colors expose derived RGB HSL and CMYK codes", () => {
  const pink = resolveCatalogColor("pink");
  assert.ok(pink);
  assert.deepEqual(pink.rgb, [240, 175, 192]);
  assert.match(pink.hsl, /^\d+°, \d+%, \d+%$/);
  assert.match(pink.cmyk, /^\d+%, \d+%, \d+%, \d+%$/);
});

test("normalization is accent and punctuation insensitive", () => {
  assert.equal(normalizeCatalogColorText("  Ροζ-Πούδρα  "), "ροζ πουδρα");
  assert.equal(resolveCatalogColor("Ροζ-Πούδρα")?.key, "blush");
});

test("product matching treats Greek and English color aliases as the same variant", () => {
  const base: ProductIdentity = {
    id: "a",
    title: "Bottle 500 ml",
    brand: "Example",
    model: "B500",
    condition: "new",
    attributes: { colour: "Beige" }
  };
  const greek: ProductIdentity = {
    ...base,
    id: "b",
    attributes: { "χρώμα": "Μπεζ" }
  };
  const result = matchProducts(base, greek);
  assert.equal(result.level, "high_confidence");
  assert.equal(result.autoMergeAllowed, true);
});

test("product matching still blocks genuinely different normalized colors", () => {
  const base: ProductIdentity = {
    id: "a",
    title: "Bottle 500 ml",
    brand: "Example",
    model: "B500",
    condition: "new",
    attributes: { color: "Pink" }
  };
  const different: ProductIdentity = {
    ...base,
    id: "b",
    attributes: { colour: "Μπεζ" }
  };
  const result = matchProducts(base, different);
  assert.equal(result.level, "different");
  assert.equal(result.autoMergeAllowed, false);
});

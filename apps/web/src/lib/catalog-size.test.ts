import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeCatalogSize,
  decodeCatalogSizeGroup,
  groupCatalogSizeFacets
} from "./catalog-size.ts";

test("normalizes explicit and bare EU footwear sizes without guessing other systems", () => {
  assert.equal(
    canonicalizeCatalogSize("40", "footwear").key,
    canonicalizeCatalogSize("EU 40", "footwear").key
  );
  assert.notEqual(
    canonicalizeCatalogSize("UK 8", "footwear").key,
    canonicalizeCatalogSize("EU 42", "footwear").key
  );
});

test("uses explicit supplier EU evidence in multi-system footwear labels", () => {
  assert.equal(
    canonicalizeCatalogSize("EU 40 / US 7 / UK 6", "footwear").key,
    canonicalizeCatalogSize("40", "footwear").key
  );
  assert.equal(
    canonicalizeCatalogSize("EU39.5/US9.5", "footwear").label,
    "EU 39.5"
  );
});

test("preserves fractional footwear sizes as distinct canonical values", () => {
  const fractional = canonicalizeCatalogSize("36⅔", "footwear");
  assert.equal(fractional.key, canonicalizeCatalogSize("EU 36 2/3", "footwear").key);
  assert.notEqual(fractional.key, canonicalizeCatalogSize("37", "footwear").key);
});

test("bundles equivalent apparel alpha and EU representations", () => {
  const s = canonicalizeCatalogSize("S", "apparel");
  assert.equal(s.label, "S · EU 36–38");
  for (const raw of ["IT40 | S", "38 | S", "S/32", "EU 36", "36", "38"]) {
    assert.equal(canonicalizeCatalogSize(raw, "apparel").key, s.key, raw);
  }

  const m = canonicalizeCatalogSize("M", "apparel");
  assert.equal(m.label, "M · EU 40–42");
  assert.equal(canonicalizeCatalogSize("EU 40", "apparel").key, m.key);
  assert.equal(canonicalizeCatalogSize("42", "apparel").key, m.key);
});

test("supplier alpha evidence wins over numeric-system hints in apparel", () => {
  assert.equal(
    canonicalizeCatalogSize("IT 38 | XS", "apparel").key,
    canonicalizeCatalogSize("XS", "apparel").key
  );
  assert.equal(canonicalizeCatalogSize("XS", "apparel").label, "XS · EU 34");
  assert.notEqual(
    canonicalizeCatalogSize("IT 38", "apparel").key,
    canonicalizeCatalogSize("S", "apparel").key
  );
});

test("normalizes extended alpha aliases without inventing EU conversions", () => {
  assert.equal(
    canonicalizeCatalogSize("2XL", "apparel").key,
    canonicalizeCatalogSize("XXL", "apparel").key
  );
  assert.equal(
    canonicalizeCatalogSize("5XL", "apparel").key,
    canonicalizeCatalogSize("XXXXXL", "apparel").key
  );
  assert.equal(
    canonicalizeCatalogSize("6XL", "apparel").key,
    canonicalizeCatalogSize("XXXXXXL", "apparel").key
  );
  assert.equal(canonicalizeCatalogSize("5XL", "apparel").label, "XXXXXL");
});

test("unifies one-size supplier aliases", () => {
  assert.equal(
    canonicalizeCatalogSize("One Size", "apparel").key,
    canonicalizeCatalogSize("OS", "apparel").key
  );
  assert.equal(
    canonicalizeCatalogSize("UNI", "generic").key,
    canonicalizeCatalogSize("OSFA", "generic").key
  );
});

test("keeps bottoms waist and inseam axes precise", () => {
  assert.equal(
    canonicalizeCatalogSize("W32 L34", "bottoms").key,
    canonicalizeCatalogSize("32x34", "bottoms").key
  );
  assert.notEqual(
    canonicalizeCatalogSize("W32/L34", "bottoms").key,
    canonicalizeCatalogSize("W32/L32", "bottoms").key
  );
  assert.equal(canonicalizeCatalogSize("XS/30", "bottoms").label, "XS / L30");
  assert.equal(canonicalizeCatalogSize("XS/32", "bottoms").label, "XS / L32");
  assert.notEqual(
    canonicalizeCatalogSize("XS/30", "bottoms").key,
    canonicalizeCatalogSize("XS/32", "bottoms").key
  );
});

test("does not turn shoe, trouser or generic numeric sizes into apparel bundles", () => {
  assert.equal(canonicalizeCatalogSize("40", "footwear").label, "EU 40");
  assert.equal(canonicalizeCatalogSize("40", "bottoms").label, "40");
  assert.equal(canonicalizeCatalogSize("38", "generic").label, "38");
  assert.notEqual(
    canonicalizeCatalogSize("40", "footwear").key,
    canonicalizeCatalogSize("M", "apparel").key
  );
});

test("treats plain belt numbers as centimetres only in belt context", () => {
  assert.equal(
    canonicalizeCatalogSize("90", "belt").key,
    canonicalizeCatalogSize("90 cm", "belt").key
  );
  assert.notEqual(
    canonicalizeCatalogSize("40", "generic").key,
    canonicalizeCatalogSize("EU 40", "generic").key
  );
});

test("groups equivalent apparel rows while preserving every filterable original", () => {
  const grouped = groupCatalogSizeFacets([
    { value: "S", count: 3 },
    { value: "IT40 | S", count: 2 },
    { value: "38 | S", count: 4 },
    { value: "EU 36", count: 5 },
    { value: "38", count: 6 },
    { value: "M", count: 1 }
  ], "apparel");

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]?.label, "S · EU 36–38");
  assert.equal(grouped[0]?.count, 20);
  assert.deepEqual(
    new Set(decodeCatalogSizeGroup(grouped[0]?.value ?? "")),
    new Set(["S", "IT40 | S", "38 | S", "EU 36", "38"])
  );
  assert.equal(grouped[1]?.label, "M · EU 40–42");
});

test("groups raw footwear values while preserving every filterable original", () => {
  const grouped = groupCatalogSizeFacets([
    { value: "40", count: 3 },
    { value: "EU 40", count: 2 },
    { value: "41", count: 1 }
  ], "footwear");

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]?.label, "EU 40");
  assert.equal(grouped[0]?.count, 5);
  assert.deepEqual(new Set(decodeCatalogSizeGroup(grouped[0]?.value ?? "")), new Set(["40", "EU 40"]));
  assert.equal(grouped[1]?.label, "EU 41");
});

test("sorts apparel bundles naturally and one-size last", () => {
  const grouped = groupCatalogSizeFacets([
    { value: "XL", count: 1 },
    { value: "S", count: 1 },
    { value: "One Size", count: 1 },
    { value: "M", count: 1 },
    { value: "XS", count: 1 },
    { value: "2XL", count: 1 }
  ], "apparel");

  assert.deepEqual(grouped.map((entry) => entry.label), [
    "XS · EU 34",
    "S · EU 36–38",
    "M · EU 40–42",
    "XL · EU 48–50",
    "XXL · EU 52–54",
    "One Size"
  ]);
});

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
});

test("preserves fractional footwear sizes as distinct canonical values", () => {
  const fractional = canonicalizeCatalogSize("36⅔", "footwear");
  assert.equal(fractional.key, canonicalizeCatalogSize("EU 36 2/3", "footwear").key);
  assert.notEqual(fractional.key, canonicalizeCatalogSize("37", "footwear").key);
});

test("normalizes explicit apparel alpha aliases and paired supplier labels", () => {
  assert.equal(
    canonicalizeCatalogSize("IT 38 | XS", "apparel").key,
    canonicalizeCatalogSize("XS", "apparel").key
  );
  assert.equal(
    canonicalizeCatalogSize("2XL", "apparel").key,
    canonicalizeCatalogSize("XXL", "apparel").key
  );
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

test("groups raw supplier values while preserving every filterable original", () => {
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

test("sorts alpha sizes naturally and one-size last", () => {
  const grouped = groupCatalogSizeFacets([
    { value: "XL", count: 1 },
    { value: "S", count: 1 },
    { value: "One Size", count: 1 },
    { value: "M", count: 1 },
    { value: "XS", count: 1 },
    { value: "2XL", count: 1 }
  ], "apparel");

  assert.deepEqual(grouped.map((entry) => entry.label), ["XS", "S", "M", "XL", "XXL", "One Size"]);
});

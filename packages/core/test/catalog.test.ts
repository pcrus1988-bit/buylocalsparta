import test from "node:test";
import assert from "node:assert/strict";
import { matchProducts, type ProductIdentity } from "../src/index.ts";

const base: ProductIdentity = {
  id: "source-a",
  title: "Apple AirPods Pro 2nd Generation USB-C",
  brand: "Apple",
  model: "AirPods Pro 2",
  mpn: "MTJV3ZM/A",
  gtin: "0195949052637",
  condition: "new",
  warrantyBasis: "EU manufacturer warranty",
  attributes: { color: "White", pack_count: "1" }
};

test("same GTIN and exact variant auto-match", () => {
  const result = matchProducts(base, { ...base, id: "source-b", title: "APPLE AirPods Pro 2 USB C" });
  assert.equal(result.level, "exact");
  assert.equal(result.autoMergeAllowed, true);
});

test("different variant attribute blocks merge even if title is close", () => {
  const result = matchProducts(base, { ...base, id: "source-b", gtin: undefined, attributes: { color: "Black", pack_count: "1" } });
  assert.equal(result.level, "different");
  assert.equal(result.autoMergeAllowed, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveZendropCategoryCode,
  ZENDROP_FALLBACK_CATEGORY_CODE
} from "../src/lib/zendrop-category-mapping.ts";

test("Zendrop taxonomy uses deterministic product-class mappings", () => {
  assert.equal(
    resolveZendropCategoryCode("Bluetooth Headset Animal Headband Sleep Mask", [{ name: "Baby Toys & Activity Equipment" }]),
    "baby-toddler-toys"
  );
  assert.equal(
    resolveZendropCategoryCode("14-Color Hairline Powder Concealer", [{ name: "Personal Care" }]),
    "beauty-tools-accessories"
  );
  assert.equal(
    resolveZendropCategoryCode("Plus Size Trousers for Men", [{ name: "Clothing" }]),
    "fashion-mens-trousers-jeans"
  );
  assert.equal(
    resolveZendropCategoryCode("Forest Goddess Sculpture", [{ name: "Household Supplies" }]),
    "decorative-objects"
  );
});

test("unknown Zendrop taxonomy never blocks publication solely for missing mapping", () => {
  assert.equal(resolveZendropCategoryCode("Unclassified supplier item", []), ZENDROP_FALLBACK_CATEGORY_CODE);
  assert.equal(ZENDROP_FALLBACK_CATEGORY_CODE, "general-products");
});

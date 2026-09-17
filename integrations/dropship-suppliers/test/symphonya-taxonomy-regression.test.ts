import assert from "node:assert/strict";
import test from "node:test";

import type { SymphonyaSourceProduct } from "../src/symphonya-v1.ts";
import { classifySymphonyaBeauty, normalizeSymphonyaProduct } from "../src/symphonya-normalize.ts";

function product(overrides: Partial<SymphonyaSourceProduct> = {}): SymphonyaSourceProduct {
  return {
    productId: "71",
    variantId: "71",
    ean: "8028713250774",
    sku: "SYM-71",
    name: "Permanent Hair Dye",
    brand: "Goldwell",
    gender: "For Women",
    category: "Hair",
    subcategory: "Hair Colouring",
    subsubcategory: "Permanent Hair Dye",
    wholesaleCostMinor: 5000,
    currency: "EUR",
    stock: 4,
    images: ["https://cdn.test/product.jpg"],
    raw: { id: 71 },
    ...overrides
  };
}

test("Symphonya cat/scat/sscat stays ordered and authoritative while gender remains a separate facet", () => {
  const evidence = normalizeSymphonyaProduct(product());
  const normalized = evidence.normalizedPayload as Record<string, any>;

  assert.deepEqual(normalized.categories, [
    { name: "Hair" },
    { name: "Hair Colouring" },
    { name: "Permanent Hair Dye" }
  ]);
  assert.deepEqual(normalized.taxonomyEvidence.path, ["Hair", "Hair Colouring", "Permanent Hair Dye"]);
  assert.equal(normalized.taxonomyEvidence.supplierHierarchyIsPrimaryEvidence, true);
  assert.equal(normalized.taxonomyEvidence.canonicalMappingPolicy, "preserve_levels_then_map");
  assert.equal(normalized.taxonomyEvidence.titleInferencePolicy, "fallback_only");
  assert.equal(normalized.taxonomyEvidence.genderAxis, "separate_facet");
  assert.equal(normalized.gender.name, "female");
  assert.equal(evidence.qualityPayload.taxonomyReviewRequired, false);
});

test("missing supplier hierarchy is held for taxonomy review rather than treated as authoritative", () => {
  const evidence = normalizeSymphonyaProduct(product({
    category: undefined,
    subcategory: undefined,
    subsubcategory: undefined,
    name: "Ambiguous supplier item"
  }));
  const normalized = evidence.normalizedPayload as Record<string, any>;

  assert.deepEqual(normalized.categories, []);
  assert.equal(normalized.taxonomyEvidence.structuredHierarchyAvailable, false);
  assert.equal(normalized.taxonomyEvidence.titleInferencePolicy, "allowed_with_review");
  assert.equal(normalized.taxonomyEvidence.ambiguousHierarchyPolicy, "quarantine_for_review");
  assert.equal(evidence.qualityPayload.taxonomyReviewRequired, true);
});

test("Symphonya For Men, For Women, For Boys and For Girls are canonical facets", () => {
  const cases = [
    ["For Men", "male"],
    ["For Women", "female"],
    ["For Boys", "boys"],
    ["For Girls", "girls"]
  ] as const;

  for (const [input, expected] of cases) {
    const normalized = normalizeSymphonyaProduct(product({ gender: input })).normalizedPayload as Record<string, any>;
    assert.equal(normalized.gender.name, expected);
    assert.equal(normalized.categories.some((entry: Record<string, unknown>) => entry.name === expected), false);
  }
});

test("structured Hair hierarchy produces a Beauty/Hair candidate without flattening the supplier path", () => {
  const candidate = classifySymphonyaBeauty(product());
  assert.equal(candidate.matched, true);
  assert.deepEqual(candidate.path, ["Beauty", "Hair"]);
  assert.equal(candidate.confidence, "high");
});

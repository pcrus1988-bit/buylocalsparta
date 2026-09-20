import assert from "node:assert/strict";
import test from "node:test";

import type { SymphonyaSourceProduct } from "../src/symphonya-v1.ts";
import {
  classifySymphonyaBeauty,
  normalizeSourceImages,
  normalizeSymphonyaProduct
} from "../src/symphonya-normalize.ts";

function product(overrides: Partial<SymphonyaSourceProduct> = {}): SymphonyaSourceProduct {
  return {
    productId: "12345",
    variantId: "12345",
    ean: "8028713250774",
    sku: "SKU-1",
    name: "Luxury Eau de Parfum",
    localizedNameEl: "Πολυτελές Eau de Parfum",
    brand: "Example Brand",
    gender: "Women",
    type: "Eau de Parfum",
    category: "perfumes",
    subcategory: "women perfumes",
    subsubcategory: "eau de parfum",
    descriptionEn: "A floral fragrance.",
    howToUseEn: "Spray lightly.",
    wholesaleCostMinor: 5000,
    rrpMinor: 9000,
    currency: "EUR",
    stock: 4,
    warehouse: "Warehouse 1",
    images: ["https://cdn.test/main.jpg", "https://cdn.test/main.jpg#fragment", "https://cdn.test/no-image.jpg"],
    raw: { id: 12345 },
    ...overrides
  };
}

test("Symphonya evidence remains supplier-scoped and stages rather than publishing directly", () => {
  const evidence = normalizeSymphonyaProduct(product());
  assert.equal(evidence.sourceProductKey, "12345");
  assert.equal(evidence.sourceIdentity.provider, "symphonya");
  assert.equal(evidence.sourceIdentity.gtinCandidate, "8028713250774");
  assert.equal(evidence.qualityPayload.publicEligible, false);
  assert.equal(evidence.qualityPayload.canonicalMergeCandidate, "ean_gtin");
  assert.equal(evidence.priceState, "review_required");
  const normalized = evidence.normalizedPayload as Record<string, any>;
  assert.equal(normalized.localisationCandidates.supplierGreekName, "Πολυτελές Eau de Parfum");
  assert.equal(normalized.localisationCandidates.servingLayer, "product_translations");
  assert.equal(normalized.localisationCandidates.customerFacingDirectSupplierTextAllowed, false);
  assert.equal(normalized.prices.msrpMinor, 9000);
  assert.equal(normalized.prices.msrpRaw, 90);
  assert.equal(normalized.variants[0].msrpMinor, 9000);
  assert.equal(normalized.variants[0].msrpRaw, 90);
});

test("stock, warehouse and wholesale-cost changes do not change the meaningful source content hash", () => {
  const left = normalizeSymphonyaProduct(product({ stock: 1, warehouse: "Warehouse 1", wholesaleCostMinor: 5000, rrpMinor: 9000 }));
  const right = normalizeSymphonyaProduct(product({ stock: 99, warehouse: "Warehouse 2", wholesaleCostMinor: 9999, rrpMinor: 12000 }));
  assert.equal(left.sourceContentHash, right.sourceContentHash);
});

test("meaningful supplier content changes do change the source hash", () => {
  const left = normalizeSymphonyaProduct(product());
  const right = normalizeSymphonyaProduct(product({ descriptionEn: "A materially different description." }));
  assert.notEqual(left.sourceContentHash, right.sourceContentHash);
});

test("invalid GTIN is not promoted as an automatic canonical merge candidate", () => {
  const evidence = normalizeSymphonyaProduct(product({ ean: "ABC-123" }));
  assert.equal(evidence.sourceIdentity.gtinCandidate, undefined);
  assert.equal(evidence.qualityPayload.canonicalMergeCandidate, "none");
  assert.equal(evidence.qualityPayload.canonicalMergeAutomaticAllowed, false);
});

test("Beauty candidate maps fragrance, makeup, skin, hair, body, personal care and grooming evidence conservatively", () => {
  assert.deepEqual(classifySymphonyaBeauty(product()).path, ["Beauty", "Fragrance"]);
  assert.deepEqual(classifySymphonyaBeauty(product({ category: "cosmetics", subcategory: "makeup", type: "mascara", name: "Mascara" })).path, ["Beauty", "Makeup"]);
  assert.deepEqual(classifySymphonyaBeauty(product({ category: "skin", subcategory: "skincare", type: "serum", name: "Face serum" })).path, ["Beauty", "Skin Care"]);
  assert.deepEqual(classifySymphonyaBeauty(product({ category: "hair care", subcategory: "shampoo", type: "shampoo", name: "Hair shampoo" })).path, ["Beauty", "Hair Care"]);
  assert.deepEqual(classifySymphonyaBeauty(product({ category: "body care", subcategory: "body lotion", type: "lotion", name: "Body lotion" })).path, ["Beauty", "Body Care"]);
  assert.deepEqual(classifySymphonyaBeauty(product({ category: "personal care", subcategory: "hygiene", type: "deodorant", name: "Deodorant" })).path, ["Beauty", "Personal Care"]);
  assert.deepEqual(classifySymphonyaBeauty(product({ category: "grooming", subcategory: "shaving", type: "aftershave", name: "Aftershave" })).path, ["Beauty", "Grooming"]);
});

test("unrelated categories are not forced into Beauty", () => {
  const candidate = classifySymphonyaBeauty(product({ category: "home", subcategory: "decor", subsubcategory: "vases", type: "vase", name: "Ceramic vase" }));
  assert.equal(candidate.matched, false);
  assert.equal(candidate.ancestor, null);
  assert.deepEqual(candidate.path, []);
});

test("images preserve supplier order, remove exact duplicates and unusable placeholders", () => {
  assert.deepEqual(normalizeSourceImages([
    "https://cdn.test/a.jpg",
    "https://cdn.test/a.jpg#x",
    "https://cdn.test/no-image.jpg",
    "javascript:alert(1)",
    "https://cdn.test/b.jpg"
  ]), ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);
});

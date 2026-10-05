import assert from "node:assert/strict";
import test from "node:test";
import {
  TRYON_PREVIEW_TTL_MS,
  resolveVirtualTryOnCategory,
  virtualTryOnCacheKey
} from "./virtual-try-on.ts";

test("maps supported FASHN apparel categories", () => {
  assert.equal(resolveVirtualTryOnCategory({ title: "Μαύρο φόρεμα midi", categoryCode: "fashion-dresses" }), "one-pieces");
  assert.equal(resolveVirtualTryOnCategory({ title: "Men's slim jeans", categoryCode: "fashion-trousers" }), "bottoms");
  assert.equal(resolveVirtualTryOnCategory({ title: "Γυναικείο σακάκι", categoryCode: "fashion-jackets" }), "tops");
});

test("does not claim unsupported footwear and accessories", () => {
  assert.equal(resolveVirtualTryOnCategory({ title: "Running shoes", categoryCode: "shoes" }), undefined);
  assert.equal(resolveVirtualTryOnCategory({ title: "Leather handbag", categoryCode: "bags" }), undefined);
  assert.equal(resolveVirtualTryOnCategory({ title: "Κολιέ", categoryCode: "jewellery" }), undefined);
});

test("cache key changes with person photo, product visual, or model version", () => {
  const base = { userId: "user_a", profileVersion: 1, canonicalVariantId: "cv_a", garmentFingerprint: "media:1", category: "tops" as const };
  const first = virtualTryOnCacheKey(base);
  assert.equal(first.length, 64);
  assert.equal(first, virtualTryOnCacheKey(base));
  assert.notEqual(first, virtualTryOnCacheKey({ ...base, profileVersion: 2 }));
  assert.notEqual(first, virtualTryOnCacheKey({ ...base, garmentFingerprint: "media:2" }));
  assert.notEqual(first, virtualTryOnCacheKey({ ...base, modelVersion: "future" }));
});

test("unsaved preview TTL is five minutes", () => {
  assert.equal(TRYON_PREVIEW_TTL_MS, 300_000);
});

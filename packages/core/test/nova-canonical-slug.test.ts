import assert from "node:assert/strict";
import test from "node:test";
import { canonicalNovaSlug } from "../../../apps/web/src/lib/nova-canonical-slug.ts";

test("Nova canonical slugs stay unique for long supplier ids with identical prefixes", () => {
  const commonProductPrefix = "product-12345678901234567890";
  const commonVariantPrefix = "variant-12345678901234567890";

  const first = canonicalNovaSlug(
    "Luxury Leather Bag",
    `${commonProductPrefix}-alpha-tail`,
    `${commonVariantPrefix}-alpha-tail`
  );
  const second = canonicalNovaSlug(
    "Luxury Leather Bag",
    `${commonProductPrefix}-beta-tail`,
    `${commonVariantPrefix}-beta-tail`
  );

  assert.notEqual(first,second);
  assert.ok(first.length <= 128);
  assert.ok(second.length <= 128);
  assert.match(first,/^luxury-leather-bag-/);
  assert.match(second,/^luxury-leather-bag-/);
});

test("Nova canonical slug generation is deterministic for the full supplier identity", () => {
  const first = canonicalNovaSlug("Sneaker","external-product-id","external-variant-id");
  const second = canonicalNovaSlug("Sneaker","external-product-id","external-variant-id");

  assert.equal(first,second);
  assert.match(first,/[a-f0-9]{20}$/);
});

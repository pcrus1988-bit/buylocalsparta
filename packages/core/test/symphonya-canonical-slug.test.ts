import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSymphonyaSlug } from "../../../apps/web/src/lib/symphonya-canonical-slug.ts";

test("Symphonya public slugs are readable and supplier-neutral", () => {
  const slug = canonicalSymphonyaSlug("Deborah – Nail Polish", "13219", "13219");
  assert.equal(slug, "deborah-nail-polish-13219-2ad3b4977968");
  assert.ok(!slug.includes("symphonya"));
});

test("Symphonya public slugs remain unique across variants", () => {
  const first = canonicalSymphonyaSlug("Luxury Nail Polish", "13219", "13219-red");
  const second = canonicalSymphonyaSlug("Luxury Nail Polish", "13219", "13219-blue");
  assert.notEqual(first, second);
  assert.ok(first.length <= 128);
  assert.ok(second.length <= 128);
});

test("supplier words are removed even when present in a source title", () => {
  const slug = canonicalSymphonyaSlug("Symphonya Example Product", "abc", "abc");
  assert.match(slug, /^example-product-abc-/);
  assert.ok(!slug.includes("symphonya"));
});

test("unicode titles remain readable instead of collapsing to an internal id", () => {
  const slug = canonicalSymphonyaSlug("Κόκκινο Βερνίκι", "200", "200");
  assert.match(slug, /^κοκκινο-βερνικι-200-/);
});

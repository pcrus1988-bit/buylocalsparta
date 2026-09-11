import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/0228_nova_multi_variant_source_link_safety.sql", "utf8");

test("Nova multi-variant staging preserves the one-approved-link invariant", () => {
  assert.match(migration, /cs\.code='nova-brandsgateway'/);
  assert.match(migration, /NEW\.reviewed_by IS NULL/);
  assert.match(migration, /NEW\.match_method IN \('exact_gtin','enrichment'\)/);
  assert.match(migration, /existing\.link_status='approved'/);
  assert.match(migration, /existing\.canonical_variant_id IS DISTINCT FROM NEW\.canonical_variant_id/);
  assert.match(migration, /RETURN NULL/);
});

test("manual catalogue decisions are not silently rewritten by the Nova guard", () => {
  assert.doesNotMatch(migration, /BEFORE UPDATE/);
  assert.match(migration, /BEFORE INSERT ON public\.catalog_source_product_links/);
});

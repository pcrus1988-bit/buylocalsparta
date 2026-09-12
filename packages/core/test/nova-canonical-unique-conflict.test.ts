import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const materializer = readFileSync("apps/web/src/lib/nova-catalogue-materializer.ts","utf8");

test("Nova canonical insert uniqueness races fail closed into review", () => {
  assert.match(materializer,/canonical_variants_market_id_slug_key/);
  assert.match(materializer,/canonical_variants_gtin_unique/);
  assert.match(materializer,/uniqueConflict: conflict/);
  assert.match(materializer,/canonical_identity_ambiguous/);
  assert.doesNotMatch(materializer,/ON CONFLICT[^\n]*canonical_variants_gtin_unique/);
});

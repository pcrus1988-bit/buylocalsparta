import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/0231_nova_materialization_source_latest_index.sql", "utf8");

test("schema 231 indexes the Nova latest-source-product scan", () => {
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS catalog_source_products_source_latest_idx[\s\S]*ON public\.catalog_source_products \(source_id, source_product_key, created_at DESC, id DESC\)/
  );
});

test("schema 231 is performance-only and does not enable Nova selling or writes", () => {
  assert.doesNotMatch(migration, /UPDATE\s+public\.dropship_suppliers/i);
  assert.doesNotMatch(migration, /order_forwarding_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration, /UPDATE\s+public\.dropship_supplier_offers/i);
  assert.doesNotMatch(migration, /merchant_visible\s*=\s*true/i);
});

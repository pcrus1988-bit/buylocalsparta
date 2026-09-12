import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const materializer = readFileSync("apps/web/src/lib/nova-catalogue-materializer.ts", "utf8");

test("Nova materialization scans a bounded resumable source-product frontier", () => {
  assert.match(materializer, /novaMaterializationCursor/);
  assert.match(materializer, /p\.source_product_key>\$2/);
  assert.match(materializer, /LIMIT \$3/);
  assert.match(materializer, /persistMaterializationCursor\(context\.sourceId,lastSourceProductKey\)/);
  assert.match(materializer, /materialization_cursor_wrapped/);
});

test("Nova materialization no longer searches every variant in the full catalogue before selecting a batch", () => {
  assert.doesNotMatch(materializer, /jsonb_array_elements\(l\.normalized_payload->'variants'\)/);
  assert.doesNotMatch(materializer, /ORDER BY l\.created_at ASC,l\.source_product_key ASC/);
});

test("cursor optimization preserves staged-only Nova safety", () => {
  assert.match(materializer, /EXPECTED_OWNER_VENDOR = "vendor_e8cb57b3c67b469d9a9d"/);
  assert.match(materializer, /'draft'/);
  assert.match(materializer, /merchant_visible/);
  assert.match(materializer, /last_catalogue_sync_at,active/);
  assert.match(materializer, /now\(\),false/);
  assert.doesNotMatch(materializer, /order_forwarding_enabled\s*=\s*true/i);
});

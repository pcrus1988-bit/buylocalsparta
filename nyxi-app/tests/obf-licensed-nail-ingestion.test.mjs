import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL("../../" + path, import.meta.url)), "utf8");

const schema = read("supabase/migrations/20261019131623_nyxi_open_beauty_facts_odbl_quarantine_v1.sql");
const queue = read("supabase/migrations/20261019131838_nyxi_obf_open_data_private_quality_queue_v1.sql");
const sync = read("supabase/migrations/20261019132006_nyxi_obf_odbl_bounded_daily_private_sync_v1.sql");
const config = read("scripts/nyxi/configure-obf-private-licensed-daily-sync-20261019.sql");

test("open licensed community data remains separate from proprietary NYXI source evidence", () => {
  assert.match(schema, /CREATE SCHEMA IF NOT EXISTS nyxi_open_data/i);
  assert.match(schema, /obf_nail_api_batches_v1/);
  assert.match(schema, /obf_nail_products_v1/);
  assert.doesNotMatch(schema, /INSERT INTO public\.nyxi_nail_shade_variants_v1/i);
});

test("ODbL and DbCL attribution is retained; no product images or public release", () => {
  assert.match(schema, /ODbL-1\.0/);
  assert.match(schema, /DbCL-1\.0/);
  assert.match(schema, /public_use_enabled=false/i);
  assert.match(schema, /publication_approved=false/i);
  assert.match(schema, /no_images=true/i);
  assert.match(schema, /community_verified_by_manufacturer=false/i);
  assert.match(schema, /shade_hex_confirmed=false/i);
});

test("ordinary users lack access to community raw formulas and source snapshots", () => {
  assert.match(schema, /REVOKE ALL ON SCHEMA nyxi_open_data FROM PUBLIC,anon,authenticated/i);
  assert.match(schema, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(schema, /REVOKE ALL ON nyxi_open_data\.obf_nail_products_v1 FROM PUBLIC,anon,authenticated/i);
  assert.match(queue, /security_invoker=true/);
});

test("only bounded, valid nail products are imported and incomplete names are quarantined", () => {
  assert.match(schema, /jsonb_array_length\(v_data->'products'\)>p_page_size/);
  assert.match(schema, /\? 'en:nail-polishes'/);
  assert.match(schema, /product_name.*650/);
  assert.match(queue, /missing_or_invalid_product_name/);
});

test("daily automatic sync identifies itself and strictly limits search volume", () => {
  assert.match(sync, /FOR page_no IN 1\.\.4 LOOP/);
  assert.match(sync, /nyxi_open_data\.import_obf_nail_page_v1/);
  assert.match(sync, /NYXI-Research\/0\.1/);
  assert.match(sync, /'requested','processed','failed'/);
  assert.match(config, /nyxi-obf-nail-product-daily-private/);
  assert.match(config, /nyxi-obf-nail-product-daily-process/);
});

test("manufacturer sites cannot silently grant themselves commercial extraction rights", () => {
  const constraints = read("scripts/nyxi/flag-manufacturer-written-rights-required-20261019.sql");
  assert.match(constraints, /permission_required_for_automated_acquisition/);
  assert.match(constraints, /Akzentz/);
  assert.match(constraints, /Manucurist/);
});

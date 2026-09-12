import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyNovaSupplierCondition } from "../src/lib/bazaar-commerce.ts";

const channelMigrationUrl = new URL("../../../db/migrations/0236_bazaar_commerce_channel.sql", import.meta.url);
const transitionMigrationUrl = new URL("../../../db/migrations/0237_bazaar_condition_transition_guard.sql", import.meta.url);
const existingClassificationMigrationUrl = new URL("../../../db/migrations/0238_bazaar_existing_nova_classification.sql", import.meta.url);

test("NOVA condition routing keeps second-life stock out of the normal catalogue", () => {
  assert.deepEqual(classifyNovaSupplierCondition({ condition: "New" }), {
    condition: "new",
    commerceChannel: "normal",
    bazaarSource: null
  });
  assert.equal(classifyNovaSupplierCondition({ condition: "PRELOVED" }).commerceChannel, "bazaar");
  assert.equal(classifyNovaSupplierCondition({ condition: { name: "Pre-Owned / Defect" } }).commerceChannel, "bazaar");
  assert.equal(classifyNovaSupplierCondition({ condition: "Damaged packaging" }).commerceChannel, "bazaar");
});

test("canonical identity is structurally isolated by commerce channel", async () => {
  const source = await readFile(channelMigrationUrl, "utf8");
  assert.match(source, /commerce_channel text NOT NULL DEFAULT 'normal'/);
  assert.match(source, /ON public\.canonical_variants \(market_id, commerce_channel, slug\)/);
  assert.match(source, /commerce_channel = 'normal'/);
  assert.match(source, /condition NOT IN \('preloved', 'preowned_defect', 'open_box'\)/);
});

test("NOVA transitions preserve history and fail closed during rolling deployments", async () => {
  const source = await readFile(transitionMigrationUrl, "utf8");
  assert.match(source, /AFTER INSERT\s+ON public\.catalog_source_products/);
  assert.match(source, /merchant_visible = false/);
  assert.match(source, /merchant_pause_active = true/);
  assert.match(source, /#retired-channel-/);
  assert.match(source, /catalog_nova_supplier_offer_channel_guard/);
  assert.match(source, /BEFORE INSERT OR UPDATE OF supplier_id, vendor_offer_id, source_product_id/);
  assert.match(source, /ERRCODE = '23514'/);
});

test("existing NOVA second-life canonicals move only when their source evidence is channel-pure", async () => {
  const source = await readFile(existingClassificationMigrationUrl, "utf8");
  assert.match(source, /has_bazaar AND has_normal/);
  assert.match(source, /BAZAAR backfill blocked/);
  assert.match(source, /SET commerce_channel = 'bazaar'/);
  assert.match(source, /supplier_preowned_defect/);
  assert.match(source, /supplier_preloved/);
});

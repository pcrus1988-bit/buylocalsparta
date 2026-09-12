import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Nova materialization follows the schema-227 draft-only identity contract", () => {
  const materializer = read("apps/web/src/lib/nova-catalogue-materializer.ts");

  assert.match(materializer, /catalog_material_variant_conflict/);
  assert.match(materializer, /canonical_identity_ambiguous/);
  assert.match(materializer, /material_variant_conflict/);
  assert.doesNotMatch(materializer, /taxonomy_missing/);

  assert.match(materializer, /commerce_channel,bazaar_source/);
  assert.match(materializer, /\$10::jsonb,NULL,'EUR',\$11,false,false,false/);
  assert.match(materializer, /classification\.commerceChannel/);
  assert.match(materializer, /classification\.bazaarSource/);
  assert.match(materializer, /vendor_sku,source_gtin,status,/);
  assert.match(materializer, /\$1::uuid,\$2::uuid,\$3::uuid,\$4::uuid,\$5,\$6,'draft'/);
  assert.match(materializer, /customer_price_minor,merchant_visible,merchant_pause_active/);
  assert.match(materializer, /\$9::jsonb,\$10,false,false,\$11,false/);
  assert.match(materializer, /publicationState: "STAGED"/);
  assert.match(materializer, /pricingPending: true/);
  assert.match(materializer, /now\(\),now\(\)\+interval '10 minutes',\$12::jsonb,now\(\),false/);
  assert.match(materializer, /backordersAllowed: false/);

  assert.doesNotMatch(materializer, /merchant_visible=true/);
});

test("Nova worker isolates materialization failures from durable catalogue sync", () => {
  const worker = read("workers/nova-catalogue-worker.ts");

  assert.match(worker, /runNovaCatalogueSyncSlice\(\)/);
  assert.match(worker, /runNovaCatalogueMaterializationSlice\(\)/);
  assert.match(worker, /nova\.catalogue_materialization_failed/);
  assert.match(worker, /materializesPublicOffers: false/);
  assert.match(worker, /writesSupplierOrders: false/);
});
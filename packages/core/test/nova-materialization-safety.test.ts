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

  assert.match(materializer, /\$7::jsonb,NULL,'EUR',\$8,false,false,false/);
  assert.match(materializer, /'draft'/);
  assert.match(materializer, /publicationState: "STAGED"/);
  assert.match(materializer, /pricingPending: true/);
  assert.match(materializer, /now\(\),now\(\)\+interval '10 minutes',\$12::jsonb,now\(\),false/);
  assert.match(materializer, /backordersAllowed: false/);

  assert.doesNotMatch(materializer, /merchant_visible=true/);
  assert.doesNotMatch(materializer, /status='active'/);
});

test("Nova worker isolates materialization failures from durable catalogue sync", () => {
  const worker = read("workers/nova-catalogue-worker.ts");

  assert.match(worker, /runNovaCatalogueSyncSlice\(\)/);
  assert.match(worker, /runNovaCatalogueMaterializationSlice\(\)/);
  assert.match(worker, /nova\.catalogue_materialization_failed/);
  assert.match(worker, /materializesPublicOffers: false/);
  assert.match(worker, /writesSupplierOrders: false/);
});

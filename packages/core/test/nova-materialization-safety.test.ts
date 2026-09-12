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

  assert.match(materializer, /condition,commerce_channel,bazaar_source/);
  assert.match(materializer, /classification\.condition/);
  assert.match(materializer, /classification\.commerceChannel/);
  assert.match(materializer, /classification\.bazaarSource/);
  assert.match(materializer, /\$10::jsonb,NULL,'EUR',\$11,false,false,false/);
  assert.match(materializer, /'draft'/);
  assert.match(materializer, /publicationState: "STAGED"/);
  assert.match(materializer, /pricingPending: true/);
  assert.match(materializer, /now\(\),now\(\)\+interval '10 minutes',\$12::jsonb,now\(\),false/);
  assert.match(materializer, /backordersAllowed: false/);

  // Supplier/location eligibility may legitimately query active records. The safety
  // invariant here is that materialization itself never makes a vendor offer visible
  // and newly created canonicals/dropship offers remain inactive by construction.
  assert.doesNotMatch(materializer, /merchant_visible\s*=\s*true/);
  assert.match(materializer, /vendor_offers[\s\S]*?'draft'/);
  assert.match(materializer, /dropship_supplier_offers[\s\S]*?false/);
});

test("Nova worker isolates materialization failures from durable catalogue sync", () => {
  const worker = read("workers/nova-catalogue-worker.ts");

  assert.match(worker, /runNovaCatalogueSyncSlice\(\)/);
  assert.match(worker, /runNovaCatalogueMaterializationSlice\(\)/);
  assert.match(worker, /nova\.catalogue_materialization_failed/);
  assert.match(worker, /materializesPublicOffers: false/);
  assert.match(worker, /writesSupplierOrders: false/);
});

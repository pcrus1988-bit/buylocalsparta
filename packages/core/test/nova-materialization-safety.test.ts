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

  // Canonical creation stays inactive and has no platform-owned public price.
  // Commerce channel / BAZAAR condition fields may evolve independently of this
  // safety invariant, so assert the named columns and current value shape rather
  // than the obsolete pre-BAZAAR parameter positions.
  assert.match(materializer, /platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled/);
  assert.match(materializer, /\$10::jsonb,NULL,'EUR',\$11,false,false,false/);

  // Supplier evidence can carry a staged customer-price candidate, but the vendor
  // offer is still explicitly draft + merchant-hidden and pricing remains pending.
  assert.match(materializer, /source_gtin,status,/);
  assert.match(materializer, /\$5,\$6,'draft'/);
  assert.match(materializer, /customer_price_minor,merchant_visible,merchant_pause_active/);
  assert.match(materializer, /\$9::jsonb,\$10,false,false,\$11,false/);
  assert.match(materializer, /publicationState: "STAGED"/);
  assert.match(materializer, /pricingPending: true/);

  // The supplier-offer projection remains inactive, bounded-stale and explicitly
  // non-backorderable until a separate governed promotion path activates selling.
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

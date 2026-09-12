import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../db/migrations/0234_nova_product_family_source_identity.sql", import.meta.url);

test("Nova family identity is persisted and concurrency-safe", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /source_supplier_id uuid/);
  assert.match(source, /REFERENCES public\.dropship_suppliers\(id\)/);
  assert.match(source, /source_external_product_id text/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS uq_product_families_source_parent/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /ON CONFLICT \(source_supplier_id,source_external_product_id\)/);
});

test("Nova source-family migration backfills, reconciles and verifies identity", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const backfillPosition = source.indexOf("Bind every governed family created by 0233");
  const finalSweepPosition = source.indexOf("Re-run after replacing the function");
  const verificationPosition = source.indexOf("NOVA source-family verification failed");

  assert.ok(backfillPosition >= 0);
  assert.ok(finalSweepPosition > backfillPosition);
  assert.ok(verificationPosition > finalSweepPosition);
  assert.match(source, /cv\.family_id IS DISTINCT FROM pf\.id/);
  assert.match(source, /shared_family_count/);
});

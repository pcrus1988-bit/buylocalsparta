import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../../db/migrations/0233_nova_product_family_identity.sql", import.meta.url);

test("Nova family identity is persisted and concurrency-safe", async () => {
  const source = await readFile(migrationUrl, "utf8");

  assert.match(source, /source_supplier_id uuid REFERENCES public\.dropship_suppliers/);
  assert.match(source, /source_external_product_id text/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS uq_product_families_source_parent/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /ON CONFLICT \(source_supplier_id,source_external_product_id\)/);
});

test("Nova family migration reconciles after trigger installation and verifies identity", async () => {
  const source = await readFile(migrationUrl, "utf8");
  const triggerPosition = source.indexOf("CREATE TRIGGER trg_nova_product_family_from_canonical");
  const finalSweepPosition = source.indexOf("Reconcile again after trigger installation");
  const verificationPosition = source.indexOf("source identity mismatches");

  assert.ok(triggerPosition >= 0);
  assert.ok(finalSweepPosition > triggerPosition);
  assert.ok(verificationPosition > finalSweepPosition);
  assert.match(source, /cv\.family_id IS DISTINCT FROM pf\.id/);
});

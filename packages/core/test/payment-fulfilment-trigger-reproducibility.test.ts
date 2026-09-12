import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/0230_payment_fulfilment_trigger_reproducibility.sql", "utf8");

test("schema 230 captures the production pending-payment fulfilment state", () => {
  assert.match(migration, /ALTER TYPE public\.fulfilment_status ADD VALUE IF NOT EXISTS 'pending_payment'/);
});

test("schema 230 captures the production payment gate semantics", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.gate_fulfilment_until_payment\(\)/);
  assert.match(migration, /NEW\.status = 'awaiting_acceptance' AND NOT payment_captured/);
  assert.match(migration, /NEW\.status := 'pending_payment'/);
  assert.match(migration, /OLD\.status = 'pending_payment'/);
  assert.match(migration, /RAISE EXCEPTION 'Cannot make unpaid fulfilment actionable/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF status ON public\.fulfilment_orders/);
});

test("schema 230 releases pending fulfilment only after captured payment", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.release_fulfilment_after_capture\(\)/);
  assert.match(migration, /IF NEW\.status = 'captured'/);
  assert.match(migration, /SET status = 'awaiting_acceptance'/);
  assert.match(migration, /AND status = 'pending_payment'/);
  assert.match(migration, /AFTER INSERT OR UPDATE OF status ON public\.payments/);
});

test("schema 230 preserves hardened direct-execute boundaries", () => {
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.gate_fulfilment_until_payment\(\) FROM PUBLIC/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.release_fulfilment_after_capture\(\) FROM PUBLIC/);
  assert.match(migration, /ARRAY\['anon', 'authenticated'\]/);
  assert.match(migration, /ARRAY\['service_role', 'bls_app_runtime', 'bls_platform_runtime'\]/);
});

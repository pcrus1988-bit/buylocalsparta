import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/0229_dropship_fulfilment_function_privileges.sql", "utf8");

test("customer-facing roles cannot directly execute fulfilment SECURITY DEFINER triggers", () => {
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.gate_fulfilment_until_payment\(\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.release_fulfilment_after_capture\(\)[\s\S]*FROM PUBLIC, anon, authenticated/);
});

test("trusted runtime roles retain explicit execute privileges", () => {
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.gate_fulfilment_until_payment\(\)[\s\S]*TO service_role, bls_app_runtime, bls_platform_runtime/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.release_fulfilment_after_capture\(\)[\s\S]*TO service_role, bls_app_runtime, bls_platform_runtime/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION/);
});

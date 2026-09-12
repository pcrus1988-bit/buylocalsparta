import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/0229_dropship_fulfilment_function_privileges.sql", "utf8");

test("customer-facing roles cannot directly execute fulfilment SECURITY DEFINER triggers", () => {
  assert.match(migration, /public\.gate_fulfilment_until_payment\(\)/);
  assert.match(migration, /public\.release_fulfilment_after_capture\(\)/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION %s FROM anon/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION %s FROM authenticated/);
});

test("trusted runtime roles retain explicit execute privileges without changing function bodies", () => {
  assert.match(migration, /GRANT EXECUTE ON FUNCTION %s TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION %s TO bls_app_runtime/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION %s TO bls_platform_runtime/);
  assert.match(migration, /to_regprocedure\(function_name\) IS NULL/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION/);
});

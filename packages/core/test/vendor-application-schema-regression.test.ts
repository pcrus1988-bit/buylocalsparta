import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

test("vendor application market lookup matches the markets schema", () => {
  const runtime = read("apps/web/src/lib/vendor-application-runtime.ts");
  const migrations = read("db/migrations/0001_initial_marketplace_schema.sql");

  assert.match(migrations, /CREATE TABLE markets/i, "initial schema must define markets");
  assert.doesNotMatch(runtime, /FROM markets WHERE code='sparta' AND active\s*=\s*true/i,
    "vendor application must not query a nonexistent markets.active column");
  assert.match(runtime, /FROM markets WHERE code='sparta' LIMIT 1/,
    "vendor application must resolve the configured Sparta market by code");
  assert.match(runtime, /FROM vendor_plans WHERE market_id=\$1 AND code=\$2 AND status='active'/,
    "vendor plan availability must remain governed by vendor_plans.status");
});

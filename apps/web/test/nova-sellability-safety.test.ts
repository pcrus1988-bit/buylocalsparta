import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const safetySourceUrl = new URL("../src/lib/nova-sellability-safety.ts", import.meta.url);
const workerSourceUrl = new URL("../../../workers/nova-catalogue-worker.ts", import.meta.url);

test("Nova sellability sweep fails closed on unavailable or expired supplier evidence", async () => {
  const source = await readFile(safetySourceUrl, "utf8");

  assert.match(source, /ds\.api_authoritative_availability=true/);
  assert.match(source, /dso\.active=true/);
  assert.match(source, /dso\.cached_available=false/);
  assert.match(source, /dso\.availability_expires_at IS NOT NULL AND dso\.availability_expires_at <= now\(\)/);
  assert.match(source, /supplier_availability_expired/);
  assert.match(source, /SET active=false/);
  assert.doesNotMatch(source, /SET active=true/);
});

test("reappeared deleted-feed offers require an explicit later vendor action", async () => {
  const source = await readFile(safetySourceUrl, "utf8");

  assert.match(source, /availability_payload->>'reappearedAt'/);
  assert.match(source, /vo\.updated_at <= \(dso\.availability_payload->>'reappearedAt'\)::timestamptz/);
  assert.match(source, /supplier_reappeared_requires_explicit_promotion/);
});

test("catalogue worker runs sellability safety before materialization", async () => {
  const source = await readFile(workerSourceUrl, "utf8");
  const sweep = source.indexOf("await runNovaSellabilitySafetySweep()");
  const materialization = source.indexOf("await runNovaCatalogueMaterializationSlice()");

  assert.ok(sweep >= 0, "worker must invoke the Nova sellability safety sweep");
  assert.ok(materialization >= 0, "worker must still invoke staged materialization");
  assert.ok(sweep < materialization, "sellability safety must run before materialization");
  assert.match(source, /writesSupplierOrders: false/);
  assert.match(source, /materializesPublicOffers: false/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const worker = readFileSync(
  fileURLToPath(new URL("../../supabase/functions/nyxi-acquisition-worker/index.ts",import.meta.url)),
  "utf8",
);

test("worker requires scheduler token and compares its SHA-256", () => {
  assert.match(worker,/x-nyxi-scheduler-token/);
  assert.match(worker,/nyxi_worker_scheduler_auth/);
  assert.match(worker,/crypto\.subtle\.digest\("SHA-256"/);
});

test("access-denied and redirected origin never trigger an automated bypass", () => {
  assert.match(worker,/upstreamCode===401\|\|upstreamCode===403/);
  assert.match(worker,/upstream_access_denied/);
  assert.match(worker,/unapproved_redirect_or_origin/);
  assert.match(worker,/needs_manual_access_review===true\)continue/);
  assert.match(worker,/upstream_403_do_not_bypass/);
});

test("repeated failed acquisitions must stop for manual review", () => {
  assert.match(worker,/collector_failure_count/);
  assert.match(worker,/attempts>=3/);
  assert.match(worker,/manual_access_review_reason/);
});

test("failures record collector versus upstream HTTP separately", () => {
  assert.match(worker,/last_worker_http_status:r\.status/);
  assert.match(worker,/last_worker_upstream_http_status:upstreamCode/);
  assert.match(worker,/upstream_network_or_tls/);
});

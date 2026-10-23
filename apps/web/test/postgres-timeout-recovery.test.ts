import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("SES research callbacks use two indexed btree identity paths", () => {
  const source = read("../src/lib/research-survey-ses-events.ts");
  assert.match(source, /WITH matching_messages AS \(/);
  assert.match(source, /WHERE provider_message_id=\$1/);
  assert.match(source, /UNION\s+SELECT id FROM research_invite_messages WHERE id=\$2::uuid/);
  assert.match(source, /JOIN research_invite_messages m ON m\.id=match\.id/);
  assert.match(source, /ORDER BY m\.created_at DESC,m\.id DESC/);
  assert.match(source, /FOR UPDATE OF m,ri/);
  assert.doesNotMatch(source, /WHERE m\.provider_message_id=\$1\s+OR m\.id=\$2::uuid/);
});

test("a transient authenticated SES callback database outage remains retryable", () => {
  const source = read("../src/app/api/webhooks/research-ses/route.ts");
  assert.match(source, /status: temporarilyUnavailable \? 503 : 400/);
  assert.match(source, /timeout\|ECONNRESET\|ECONNREFUSED\|ETIMEDOUT/);
  assert.match(source, /RESEARCH_SES_TEMPORARILY_UNAVAILABLE/);
});

test("Vercel admin connection lanes release idle pg clients rapidly", () => {
  const source = read("../src/lib/postgres-runtime.ts");
  assert.match(source, /const ADMIN_DB_IDLE_TIMEOUT_MS = "10000"/);
  assert.match(source, /BLS_DB_APPLICATION_NAME: "buy-local-sparta-web-research-overview"/);
  assert.match(source, /BLS_DB_IDLE_TIMEOUT_MS: "10000"/);
  assert.match(source, /const WEB_DB_POOL_MAX = "2"/);
});

test("public research never scans high-volume invitations to assemble progress on request", () => {
  const source = read("../src/lib/research-observatory-runtime.ts");
  assert.match(source, /FROM bls_private\.research_progress_public/);
  assert.match(source, /FROM bls_private\.research_progress_geography/);
  assert.match(source, /summary_refreshed_at/);
  assert.match(source, /revalidate: 30/);
});

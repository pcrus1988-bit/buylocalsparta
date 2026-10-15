import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql=readFileSync(new URL("../supabase/migrations/20261014_nyxi_exact_asset_publication_gate.sql",import.meta.url),"utf8");
test("snapshot manifest points to the exact approval and approved final URL",()=>{
  assert.match(sql,/a\.id::text=m\.metadata->>'asset_approval_id'/);
  assert.match(sql,/a\.id::text=s\.provenance->>'asset_approval_id'/);
  assert.match(sql,/s\.final_url=a\.approved_final_url/);
  assert.match(sql,/s\.final_url=a\.asset_url/);
  assert.match(sql,/m\.mirrored_to_drive IS NOT TRUE/);
  assert.match(sql,/a\.mirror_authorized IS TRUE/);
});
test("public evidence is limited to current rights-valid snapshots and immutable hashes",()=>{
  assert.match(sql,/JOIN public\.nyxi_valid_snapshots_v1 v/);
  assert.match(sql,/v\.latest_snapshot IS TRUE/);
  assert.match(sql,/a\.snapshot_sha256=v\.sha256/);
  assert.match(sql,/a\.fragment_sha256=f\.content_sha256/);
  assert.match(sql,/a\.approved_content_sha256=f\.content_sha256/);
  assert.match(sql,/a\.rights_evidence_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql,/a\.public_excerpt_authorized IS TRUE/);
  assert.match(sql,/a\.revoked_at IS NULL/);
});
test("reviewer and publisher are independent, human-account based, and active",()=>{
  assert.match(sql,/publisher\.role='publisher'/);
  assert.match(sql,/rights_reviewer\.role IN \('reviewer','publisher'\)/);
  assert.match(sql,/publisher\.disabled_at IS NULL/);
  assert.match(sql,/rights_reviewer\.disabled_at IS NULL/);
  assert.match(sql,/a\.reviewer_user_id <> a\.rights_reviewer_user_id/);
  assert.match(sql,/a\.approved_by=a\.reviewer_user_id::text/);
});
test("migration doesn't grant publication, add reviewers, or expose private material",()=>{
  assert.doesNotMatch(sql,/\bINSERT INTO\b|\bGRANT\b|\bUPDATE public\.nyxi_evidence_fragments\b/i);
  assert.match(sql,/public_excerpt_authorized boolean NOT NULL DEFAULT false/);
  assert.match(sql,/security_invoker = true, security_barrier = true/);
});

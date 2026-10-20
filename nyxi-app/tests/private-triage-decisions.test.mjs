import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync(new URL("../../supabase/migrations/20261020203900_nyxi_private_fragment_triage_events_v1.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/nyxi-reviewer-triage/index.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/reviewer/triage/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../app/admin/reviewer-triage.tsx",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../app/admin/reviewer-workspace.tsx",import.meta.url),"utf8");

test("private triage is append-only, immune to direct anon/authenticated writes",()=>{
  assert.match(migration,/ALTER TABLE public\.nyxi_fragment_triage_events_v1 ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/REVOKE ALL ON public\.nyxi_fragment_triage_events_v1 FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/GRANT SELECT, INSERT ON public\.nyxi_fragment_triage_events_v1 TO service_role/);
  assert.match(migration,/BEFORE UPDATE OR DELETE/);
  assert.match(migration,/nyxi_triage_event_immutable/);
  assert.doesNotMatch(migration,/GRANT\s+(INSERT|UPDATE|DELETE)\s+ON\s+public\.nyxi_fragment_triage_events_v1\s+TO\s+(anon|authenticated)/);
});

test("triage RPC remains independent of publication and rechecks current reviewer/snapshot",()=>{
  assert.match(migration,/SECURITY INVOKER/);
  assert.match(migration,/FROM public\.nyxi_private_review_queue_v1 q/);
  assert.match(migration,/r\.disabled_at IS NULL/);
  assert.match(migration,/q\.fragment_id=p_fragment_id/);
  assert.match(migration,/snapshot_sha256,fragment_sha256/);
  assert.match(migration,/ON CONFLICT \(reviewer_user_id,request_id\) DO NOTHING/);
  assert.match(migration,/triage_request_id_conflict/);
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.nyxi_record_fragment_triage_v1.*\n\s*TO service_role/s);
  assert.doesNotMatch(migration,/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.nyxi_fragment_publication_approvals/);
  assert.doesNotMatch(migration,/UPDATE\s+public\.nyxi_evidence_fragments/i);
  assert.doesNotMatch(migration,/GRANT .* TO PUBLIC, anon, authenticated/);
});

test("edge revalidates live confirmed identity, allowlist and calls only triage RPC",()=>{
  assert.match(edge,/jwt===anon\|\|jwt===service/);
  assert.match(edge,/\/auth\/v1\/user/);
  assert.match(edge,/user\.email_confirmed_at/);
  assert.match(edge,/\/rest\/v1\/nyxi_reviewers\?/);
  assert.match(edge,/disabled_at=is\.null/);
  assert.match(edge,/\/rest\/v1\/rpc\/nyxi_record_fragment_triage_v1/);
  assert.match(edge,/publication:"none"/);
  assert.doesNotMatch(edge,/fragment_publication_approvals|metadata\.review_status\s*=/);
});

test("browser form and same-origin proxy cannot approve or publish a fragment",()=>{
  assert.match(route,/origin!==null&&origin!==req\.nextUrl\.origin/);
  assert.match(route,/authorization/);
  assert.match(route,/cache-control":"private, no-store/);
  assert.match(route,/\/functions\/v1\/nyxi-reviewer-triage/);
  assert.match(ui,/crypto\.randomUUID\(\)/);
  assert.match(ui,/minLength=\{20\}/);
  assert.match(ui,/publication/);
  assert.match(workspace,/ReviewerTriage/);
  assert.doesNotMatch(ui+route,/localStorage|sessionStorage|service_role|onApprove|publishFragment/);
});

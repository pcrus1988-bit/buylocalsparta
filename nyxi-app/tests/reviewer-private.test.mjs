import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const migration=readFileSync(new URL("../supabase/migrations/20261013_nyxi_private_review_queue.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../supabase/functions/nyxi-reviewer-queue/index.ts",import.meta.url),"utf8");
const session=readFileSync(new URL("../app/api/reviewer/session/route.ts",import.meta.url),"utf8");
const proxy=readFileSync(new URL("../app/api/reviewer/queue/route.ts",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../app/admin/reviewer-workspace.tsx",import.meta.url),"utf8");

test("private queue includes current valid source snapshots and never grants publication",()=>{
  assert.match(migration,/nyxi_valid_snapshots_v1/);
  assert.match(migration,/v\.latest_snapshot=true/);
  assert.match(migration,/e\.metadata->>'review_status'/);
  assert.match(migration,/row_number\(\) OVER/);
  assert.match(migration,/REVOKE ALL ON public\.nyxi_private_review_queue_v1 FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/GRANT SELECT ON public\.nyxi_private_review_queue_v1 TO service_role/);
  assert.match(migration,/ALTER TABLE public\.nyxi_reviewers ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration,/INSERT INTO public\.nyxi_fragment_publication_approvals|UPDATE public\.nyxi_evidence_fragments/);
});
test("Edge rejects missing, service and anonymous JWTs and requires registered, confirmed human identity",()=>{
  assert.match(edge,/jwt === anon \|\| jwt === service/);
  assert.match(edge,/auth\/v1\/user/);
  assert.match(edge,/email_confirmed_at/);
  assert.match(edge,/nyxi_reviewers/);
  assert.match(edge,/disabled_at=is\.null/);
  assert.match(edge,/read_only: true/);
  assert.match(edge,/publication: "none"/);
  assert.doesNotMatch(edge,/\.insert\(|\.update\(|INSERT INTO |UPDATE nyxi_/);
});
test("reviewer login has no signup and only returns temporary tokens after role probe",()=>{
  assert.match(session,/grant_type=password/);
  assert.match(session,/if \(!allowed\.ok\)/);
  assert.match(session,/data\?\.read_only!==true/);
  assert.doesNotMatch(session,/signup|signUp|createUser|service_role/);
});
test("reviewer UI and proxy do not persist identities or enable unapproved publication",()=>{
  assert.match(proxy,/authorization:auth/);
  assert.match(proxy,/cache-control":"private, no-store/);
  assert.match(workspace,/useState\(""\)/);
  assert.match(workspace,/Μόνο ανάγνωση/);
  assert.doesNotMatch(workspace,/localStorage|sessionStorage|service_role|onApprove|publishFragment/);
});

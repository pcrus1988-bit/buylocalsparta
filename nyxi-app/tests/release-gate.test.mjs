import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Review login may be visible, but private evidence is always checked by Supabase Auth and an independently provisioned reviewer allowlist.
const reviewer = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/nyxi-public-search/index.ts", import.meta.url), "utf8");
test("reviewer UI only exposes login; authorization is enforced on every API call", () => {
  assert.match(reviewer, /ReviewerWorkspace/);
  assert.match(reviewer, /robots:/);
  const reviewEdge=readFileSync(new URL("../supabase/functions/nyxi-reviewer-queue/index.ts", import.meta.url),"utf8");
  const login=readFileSync(new URL("../app/api/reviewer/session/route.ts", import.meta.url),"utf8");
  const queue=readFileSync(new URL("../app/api/reviewer/queue/route.ts", import.meta.url),"utf8");
  assert.match(reviewEdge, /auth\\/v1\\/user/);
  assert.match(reviewEdge, /nyxi_reviewers/);
  assert.match(reviewEdge, /email_confirmed_at/);
  assert.match(reviewEdge, /disabled_at=is\\.null/);
  assert.match(reviewEdge, /forbidden/);
  assert.match(login, /grant_type=password/);
  assert.match(login, /allowed\\.ok/);
  assert.doesNotMatch(login, /signup|signUp|service_role/);
  assert.match(queue, /authorization:auth/);
  assert.match(queue, /no-store/);
});
test("public search requires independently approved evidence", () => {
  assert.match(edge, /nyxi_reviewed_fragments_v1/);
  // The independent reviewed-only view enforces approval; every returned
  // candidate must be checked against that view again before publication.
  assert.match(edge, /nyxi_reviewed_fragments_v1\?select=id&id=in/);
  assert.match(edge, /rows\.filter\(\(row\) => allowedIds\.has\(row\.fragment_id\)\)/);
  assert.match(edge, /no_approved_evidence/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Release-gate guardrails until Agent 4's independently authorized
// reviewer service and Agent 1's rights service have been accepted.
const reviewer = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/nyxi-public-search/index.ts", import.meta.url), "utf8");
test("reviewer route is inaccessible until independent auth is wired", () => {
  assert.match(reviewer, /notFound\(\)/);
});
test("public search requires independently approved evidence", () => {
  assert.match(edge, /nyxi_reviewed_fragments_v1/);
  // The independent reviewed-only view enforces approval; every returned
  // candidate must be checked against that view again before publication.
  assert.match(edge, /nyxi_reviewed_fragments_v1\?select=id&id=in/);
  assert.match(edge, /rows\.filter\(\(row\) => allowedIds\.has\(row\.fragment_id\)\)/);
  assert.match(edge, /no_approved_evidence/);
});

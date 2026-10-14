import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const atlasEdge = readFileSync(new URL("../supabase/functions/nyxi-public-atlas/index.ts", import.meta.url), "utf8");
const atlasRoute = readFileSync(new URL("../app/api/sources/route.ts", import.meta.url), "utf8");
const atlasUI = readFileSync(new URL("../app/public-source-atlas.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const search = readFileSync(new URL("../supabase/functions/nyxi-public-search/index.ts", import.meta.url), "utf8");

test("public atlas query exposes only active source-level URLs, not private evidence", () => {
  assert.match(atlasEdge, /status=eq\.active/);
  assert.match(atlasEdge, /select=source_key,title,authority,canonical_url,source_role/);
  assert.doesNotMatch(atlasEdge, /select=\*|body_text|snapshot_id|storage_path|extraction_run_id/);
  assert.match(atlasEdge, /https:/);
  assert.match(atlasEdge, /links_only_not_evidence_approval/);
  assert.match(atlasEdge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(atlasEdge, /request.method !== "GET"/);
});

test("atlas Next.js proxy is bound to one fixed endpoint and checks schema", () => {
  assert.match(atlasRoute, /nyxi-public-atlas/);
  assert.match(atlasRoute, /links_only_not_evidence_approval/);
  assert.match(atlasRoute, /status: "ok", publication: "references_only"/);
  assert.doesNotMatch(atlasRoute, /SUPABASE_SERVICE_ROLE_KEY|body_text|snapshot_id/);
});

test("public atlas UI renders original publishers with a visible evidence caveat", () => {
  assert.match(home, /PublicSourceAtlas active=\{tab === "search"\}/);
  assert.match(atlasUI, /Η καταχώριση μιας πηγής/);
  assert.match(atlasUI, /noopener/);
  assert.match(atlasUI, /\/api\/sources/);
  assert.match(atlasUI, /AbortController/);
});

test("existing fragment search still checks independent publication approval", () => {
  assert.match(search, /nyxi_reviewed_fragments_v1\?select=id/);
  assert.match(search, /nyxi_reviewed_fragments_v1\?select=id&id=in/);
  assert.match(search, /rows\.filter\(\(row\) => allowedIds\.has\(row\.fragment_id\)\)/);
  assert.match(search, /no_approved_evidence/);
});

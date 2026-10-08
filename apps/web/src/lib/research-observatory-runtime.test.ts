import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A source contract test guards the public SQL scope without querying production.
const source = readFileSync(new URL("./research-observatory-runtime.ts", import.meta.url), "utf8");
const publicQuery = source.slice(
  source.indexOf("async function queryPublicResearchObservatory"),
  source.indexOf("export async function publicResearchStudy")
);

test("public observatory never falls back to a pilot draw when the main phase opens", () => {
  assert.match(publicQuery, /d\\.fieldwork_phase='main'/);
  assert.doesNotMatch(publicQuery, /active_draw\\.id|d\\.fieldwork_phase='pilot'/);
  assert.match(publicQuery, /d\\.status IN \\('locked','fielded'\\)/);
});

test("cohort A and B are counted together rather than taking the newest draw only", () => {
  assert.match(publicQuery, /SUM\\(\\(/);
  assert.match(publicQuery, /SUM\\(COALESCE\\(sd\\.desired_complete_n,0\\)\\)/);
  assert.match(publicQuery, /d\\.wave_id=w\\.id/);
});

test("invitation, delivery, open and response counts are all main-only", () => {
  assert.equal((publicQuery.match(/ri\\.fieldwork_phase='main'/g) || []).length, 2);
  assert.match(publicQuery, /ri\\.wave_id=w\\.id/);
  assert.match(publicQuery, /rr\\.wave_id=w\\.id/);
  assert.match(publicQuery, /rr\\.status='completed'/);
});

test("shared public counters are not recomputed for every visitor", () => {
  assert.match(publicQuery, /unstable_cache\\(/);
  assert.match(publicQuery, /revalidate: 30/);
});

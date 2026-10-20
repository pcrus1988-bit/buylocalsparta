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
  assert.match(publicQuery, /d\.fieldwork_phase='main'/);
  assert.doesNotMatch(publicQuery, /active_draw\.id|d\.fieldwork_phase='pilot'/);
  assert.match(publicQuery, /d\.status IN \('locked','fielded'\)/);
});

test("cohort A and B are counted together rather than taking the newest draw only", () => {
  assert.match(publicQuery, /SUM\(\(/);
  assert.match(publicQuery, /SUM\(COALESCE\(sd\.desired_complete_n,0\)\)/);
  assert.match(publicQuery, /d\.wave_id=w\.id/);
});

test("invitation, delivery, open and response counts are all main-only", () => {
  assert.ok((publicQuery.match(/ri\.fieldwork_phase='main'/g) || []).length >= 2);
  assert.match(publicQuery, /ri\.wave_id=w\.id/);
  assert.match(publicQuery, /rr\.wave_id=w\.id/);
  assert.match(publicQuery, /rr\.status='completed'/);
});

test("shared public counters are not recomputed for every visitor", () => {
  assert.match(publicQuery, /unstable_cache\(/);
  assert.match(publicQuery, /revalidate: 30/);
});

test("recovery counters do not rewrite response statuses or manufacture consent", () => {
  assert.match(publicQuery, /calculateResearchRecoveryTotals/);
  assert.match(publicQuery, /cp\.suppression_status='active'/);
  assert.match(publicQuery, /ri\.status='started'/);
  assert.match(publicQuery, /saved\.final_question_answered_at IS NOT NULL/);
  assert.match(publicQuery, /contentCompleteUnsubmitted:/);
  assert.match(publicQuery, /reachedFinalNeedsCorrection:/);
  assert.doesNotMatch(publicQuery, /INSERT INTO research_consents|UPDATE research_responses SET status='completed'/);
});

const researchLandingSource = readFileSync(new URL("../app/research/page.tsx", import.meta.url), "utf8");
const liveProgressSource = readFileSync(new URL("../components/ResearchLiveProgress.tsx", import.meta.url), "utf8");

test("active survey progress is shown directly on the public research landing page", () => {
  assert.match(researchLandingSource, /id="survey-progress"/);
  assert.match(researchLandingSource, /<ResearchLiveProgress initialStudy={lead} showHeatmap={false}/);
  assert.match(researchLandingSource, /href={lead\?\.status === "fielding" \? "#survey-progress" : "#studies"}/);
  assert.match(researchLandingSource, /\{study\.targetCompletes > 0 && <>/);
  assert.match(researchLandingSource, /<strong>\{study\.started\.toLocaleString\("el-GR"\)\} συμμετοχές που ξεκίνησαν<\/strong>/);
});

test("the landing progress updates from the main-only public endpoint without duplicating the map", () => {
  assert.match(liveProgressSource, /fetch\("\/api\/research\/observatory", \{ cache: "no-store" \}\)/);
  assert.match(liveProgressSource, /window\.setInterval\(refresh, 30_000\)/);
  assert.match(liveProgressSource, /showHeatmap = true/);
  assert.match(liveProgressSource, /showHeatmap && study\.slug === "greek-retail-2026"/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A source contract test guards the public SQL scope without querying production.
const source = readFileSync(new URL("./research-observatory-runtime.ts", import.meta.url), "utf8");
const publicQuery = source.slice(
  source.indexOf("async function queryPublicResearchObservatory"),
  source.indexOf("export async function publicResearchStudy")
);

test("public observatory reads the existing main-fieldwork projection instead of scanning live draws", () => {
  assert.match(publicQuery, /FROM bls_private\.research_progress_public/);
  assert.match(publicQuery, /WHERE wave_status <> 'archived'/);
  assert.doesNotMatch(publicQuery, /FROM research_sample_draws d|active_draw\.id/);
});

test("cohort A and B counts are consumed from the precomputed combined summary", () => {
  assert.match(publicQuery, /selected: numberValue\(row\.selected\)/);
  assert.match(publicQuery, /targetCompletes: numberValue\(row\.target_completes\)|const targetCompletes = numberValue\(row\.target_completes\)/);
  assert.match(publicQuery, /started: numberValue\(row\.started\)/);
  assert.match(publicQuery, /const completed = numberValue\(row\.completed\)/);
});

test("main-fieldwork geography and official response counts come from bounded read models", () => {
  assert.match(publicQuery, /FROM bls_private\.research_progress_geography/);
  assert.match(publicQuery, /adminFinalized = numberValue\(row\.admin_finalized\)/);
  assert.match(publicQuery, /participantConfirmed: completed - adminFinalized/);
  assert.match(publicQuery, /summaryRefreshedAt: isoDate\(row\.summary_refreshed_at\)/);
  assert.doesNotMatch(publicQuery, /FROM research_invite_events rie/);
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
  assert.match(liveProgressSource, /study\.summaryRefreshedAt \?\? lastRefresh/);
  assert.match(liveProgressSource, /setRefreshFailed\(true\)/);
});

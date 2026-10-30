import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// A source contract test guards the public SQL scope without querying production.
const source = readFileSync(new URL("./research-observatory-runtime.ts", import.meta.url), "utf8");
const publicQuery = source.slice(
  source.indexOf("async function queryPublicResearchObservatory"),
  source.indexOf("export async function publicResearchStudy")
);

test("public observatory reads the governed main-fieldwork rollup, not 100k+ invites", () => {
  assert.match(publicQuery, /FROM bls_private\.research_progress_public/);
  assert.match(publicQuery, /summary_refreshed_at/);
  assert.doesNotMatch(publicQuery, /LEFT JOIN LATERAL \(\s*SELECT\s*count\(\*\)::int AS invites/);
});

test("all cohorts remain represented by the precomputed summary view", () => {
  assert.match(publicQuery, /selected,target_completes,invites,sent/);
  assert.match(publicQuery, /delivered,opened,started,completed,admin_finalized/);
  assert.match(publicQuery, /participantConfirmed: completed - adminFinalized/);
});

test("public geography comes from the refreshed aggregate, not personal response joins", () => {
  assert.match(publicQuery, /FROM bls_private\.research_progress_geography/);
  assert.match(publicQuery, /SELECT study_id,wave_id,prefecture,postcode,started/);
  assert.doesNotMatch(publicQuery, /GROUP BY rr\.study_id,rr\.wave_id/);
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

test("2026 research landing guides readers to released findings, map, and methodology", () => {
  assert.match(researchLandingSource, /const results =/);
  assert.match(researchLandingSource, /href: results/);
  assert.match(researchLandingSource, /#results-map/);
  assert.match(researchLandingSource, /href: methodology/);
  assert.match(researchLandingSource, /Δείτε τα ευρήματα/);
  assert.match(researchLandingSource, /aria-label="Πλοήγηση στη μελέτη Ελληνικό Λιανεμπόριο 2026"/);
  assert.doesNotMatch(researchLandingSource, /id="survey-progress"|<ResearchLiveProgress/);
  assert.doesNotMatch(researchLandingSource, /Δεν έχουν δημοσιευθεί ακόμη αποτελέσματα/);
});

test("the reusable live-progress component keeps its main-only refresh and optional map", () => {
  assert.match(liveProgressSource, /fetch\("\/api\/research\/observatory", \{ cache: "no-store" \}\)/);
  assert.match(liveProgressSource, /window\.setInterval\(refresh, 30_000\)/);
  assert.match(liveProgressSource, /showHeatmap = true/);
  assert.match(liveProgressSource, /showHeatmap && study\.slug === "greek-retail-2026"/);
});

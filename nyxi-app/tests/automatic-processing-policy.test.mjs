import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql=readFileSync(new URL("../../supabase/migrations/20261022062500_nyxi_automatic_private_processing_policy_v1.sql",import.meta.url),"utf8");

test("owner sets an enduring automatic default without a human approval queue",()=>{
  assert.match(sql,/decision_mode='automatic'/);
  assert.match(sql,/human_review_required=false/);
  assert.match(sql,/future_ingestion_automatic=true/);
  assert.match(sql,/auto_approved_private/);
  assert.match(sql,/nyxi_automated_processing_readiness_v1/);
  assert.match(sql,/FROM public\.nyxi_automated_evidence_decisions_v1/);
});

test("automatic classification requires the existing valid exact-source snapshot and complete extraction",()=>{
  assert.match(sql,/LEFT JOIN public\.nyxi_valid_snapshots_v1 v/);
  assert.match(sql,/v\.latest_snapshot IS TRUE/);
  assert.match(sql,/source_active/);
  assert.match(sql,/authorized_snapshot_sha256 IS NULL/);
  assert.match(sql,/public\.nyxi_extraction_runs x/);
  assert.match(sql,/x\.status='complete'/);
  assert.match(sql,/fragment_sha256 !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql,/duplicate_rank>1/);
  assert.match(sql,/probable_page_chrome/);
  assert.match(sql,/text_length<90/);
});

test("processing decisions computed for future snapshots, never rewrite archived originals",()=>{
  assert.match(sql,/CREATE OR REPLACE VIEW public\.nyxi_automated_evidence_decisions_v1/);
  assert.match(sql,/FROM public\.nyxi_evidence_fragments e/);
  assert.doesNotMatch(sql,/UPDATE public\.nyxi_evidence_fragments|DELETE FROM public\.nyxi_evidence_fragments/);
  assert.doesNotMatch(sql,/INSERT INTO public\.nyxi_fragment_publication_approvals/);
  assert.doesNotMatch(sql,/UPDATE public\.nyxi_asset_acquisition_approvals/);
  assert.doesNotMatch(sql,/GRANT .* TO anon|GRANT .* TO authenticated/i);
});

test("no unapproved excerpt publication, reviewer impersonation, or loss of isolation",()=>{
  assert.match(sql,/scope='private_evidence_processing'/);
  assert.match(sql,/separate_provenance_and_rights_gate/);
  assert.match(sql,/false AS public_excerpt_authorized/);
  assert.match(sql,/ALTER TABLE public\.nyxi_processing_policy_v1 ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON public\.nyxi_automated_evidence_decisions_v1 FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/REVOKE ALL ON public\.nyxi_automated_processing_readiness_v1 FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/GRANT SELECT ON public\.nyxi_automated_evidence_decisions_v1 TO service_role/);
  assert.doesNotMatch(sql,/\bINSERT INTO public\.nyxi_reviewers\b|reviewer_user_id.*gen_random_uuid/);
});

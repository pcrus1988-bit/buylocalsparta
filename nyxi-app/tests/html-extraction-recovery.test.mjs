import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const worker=readFileSync(
  fileURLToPath(new URL("../../supabase/functions/nyxi-acquisition-worker/index.ts",import.meta.url)),"utf8");
const html=worker.slice(worker.indexOf("// Fail-closed HTML extraction recovery."),worker.indexOf("const pdfExtraction=[];"));

test("HTML snapshots with terminal extraction errors are quarantined, never hot-looped",()=>{
  assert.match(html,/\["empty_extraction","unsupported_format","integrity_mismatch","snapshot_missing"\]/);
  assert.match(html,/extraction_status:"manual_review_required"/);
  assert.match(html,/html_manual_review_required:needsReview/);
  assert.match(html,/!row\.metadata\?\.html_manual_review_required/);
});

test("transient HTML extraction failures use bounded retry and persisted diagnostics",()=>{
  assert.match(html,/html_failure_count:failures/);
  assert.match(html,/html_last_error:/);
  assert.match(html,/Date\.now\(\)\+6\*60\*60\*1000/);
  assert.match(html,/html_next_attempt_after/);
  assert.match(html,/extractedThisRun>=4/);
});

test("recovery is fail-closed and will not overwrite a concurrently completed snapshot",()=>{
  assert.match(html,/extraction_status=eq\.ready/);
  assert.match(html,/nyxi_extraction_runs\?snapshot_id=eq\./);
  assert.match(html,/extraction_status:"complete"/);
  assert.doesNotMatch(html,/fragment_publication_approvals|review_status:"approved"|mirror_authorized:true/);
});

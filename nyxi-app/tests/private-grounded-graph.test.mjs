import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20261014_nyxi_private_grounded_candidates.sql",import.meta.url),"utf8");
test("only rights-valid latest private review evidence supplies graph edges",()=>{
  assert.match(sql,/FROM public\.nyxi_private_review_queue_v1 q/);
  assert.match(sql,/s\.source_key='us-fda-nail-care-products'/);
  assert.match(sql,/q\.quality_lane='human_evidence_review'/);
  assert.match(sql,/snapshot_sha256/);
  assert.match(sql,/fragment_sha256/);
});
test("candidate graph is repeatable and explicitly unpublished",()=>{
  assert.match(sql,/ON CONFLICT \(canonical_key\) DO NOTHING/);
  assert.match(sql,/ON CONFLICT \(entity_id,fragment_id,evidence_role\) DO NOTHING/);
  assert.match(sql,/ON CONFLICT \(from_entity_id,to_entity_id,predicate,fragment_id\) DO NOTHING/);
  assert.match(sql,/not_for_publication',true/);
  assert.match(sql,/review_status','pending/);
  assert.doesNotMatch(sql,/nyxi_fragment_publication_approvals|nyxi_reviewed_fragments_v1|\bGRANT\b|\bDELETE\b/i);
});
test("private relation does not assert compliance or safety",()=>{
  assert.match(sql,/'discussed_in_context_of'/);
  assert.doesNotMatch(sql,/'is_safe'|'is_compliant'|'contains'|'recommended_for'/);
  assert.match(sql,/ON q\.excerpt ~\* rules\.ingredient_rx AND q\.excerpt ~\* rules\.category_rx/);
});

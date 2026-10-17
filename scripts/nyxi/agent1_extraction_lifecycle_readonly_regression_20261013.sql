-- NYXI Agent 1 / Agent 2 handoff | 2026-10-13 | #1460 #1444
-- READ ONLY. Metadata reconciliation candidates, NOT permission to publish.
-- An extraction run is not a rights grant. No Storage-byte rehash is performed.
WITH snapshot_state AS (
 SELECT s.id, s.source_id, s.parser_status,
        m.id AS manifest_id, m.source_id AS manifest_source_id,
        m.extraction_status,
        (SELECT count(*) FROM public.nyxi_extraction_runs r
          WHERE r.snapshot_id=s.id) AS run_count,
        (SELECT count(*) FROM public.nyxi_extraction_runs r
          WHERE r.snapshot_id=s.id AND r.source_id=s.source_id
            AND r.status='complete' AND r.completed_at IS NOT NULL
            AND r.fragment_count>0) AS valid_run_count,
        (SELECT max(r.fragment_count) FROM public.nyxi_extraction_runs r
          WHERE r.snapshot_id=s.id) AS declared_fragments,
        (SELECT count(*) FROM public.nyxi_evidence_fragments f
          WHERE f.snapshot_id=s.id AND f.source_id=s.source_id) AS actual_fragments,
        (SELECT count(*) FROM public.nyxi_evidence_fragments f
          WHERE f.snapshot_id=s.id AND f.source_id<>s.source_id) AS wrong_source_fragments
 FROM public.nyxi_source_snapshots s
 LEFT JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=s.id
), classification AS (
 SELECT *,
   (manifest_id IS NOT NULL AND manifest_source_id=source_id
     AND run_count=1 AND valid_run_count=1
     AND actual_fragments>0 AND declared_fragments=actual_fragments
     AND wrong_source_fragments=0) AS evidence_consistent,
   (parser_status='pending' AND extraction_status='ready') AS lifecycle_stale
 FROM snapshot_state
), fixtures(label,manifest_ok,runs,complete_run,declared,actual,wrong_source,
            stale,expected_candidate) AS (
 VALUES
 ('eligible',true,1,1,8::bigint,8::bigint,0::bigint,true,true),
 ('already_reconciled',true,1,1,8,8,0,false,false),
 ('no_manifest',false,1,1,8,8,0,true,false),
 ('failed_run',true,1,0,8,8,0,true,false),
 ('duplicate_runs',true,2,1,8,8,0,true,false),
 ('fragment_count_mismatch',true,1,1,9,8,0,true,false),
 ('cross_source_fragment',true,1,1,8,8,1,true,false),
 ('empty_extraction',true,1,1,0,0,0,true,false)
), fixture_results AS (
 SELECT label, expected_candidate,
   (manifest_ok AND runs=1 AND complete_run=1 AND actual>0
     AND declared=actual AND wrong_source=0 AND stale) AS actual_candidate
 FROM fixtures
)
SELECT 'snapshots' metric, count(*)::text result FROM classification
UNION ALL SELECT 'metadata_reconciliation_candidates',
  count(*) FILTER (WHERE evidence_consistent AND lifecycle_stale)::text FROM classification
UNION ALL SELECT 'inconsistent_or_ambiguous_snapshots',
  count(*) FILTER (WHERE NOT evidence_consistent)::text FROM classification
UNION ALL SELECT 'already_reconciled_snapshots',
  count(*) FILTER (WHERE evidence_consistent AND NOT lifecycle_stale)::text FROM classification
UNION ALL SELECT 'cross_source_fragment_rows',
  coalesce(sum(wrong_source_fragments),0)::text FROM classification
UNION ALL SELECT 'synthetic_passed',
  count(*) FILTER (WHERE actual_candidate IS NOT DISTINCT FROM expected_candidate)::text
  ||'/'||count(*)::text FROM fixture_results
UNION ALL SELECT 'synthetic_failures',
  coalesce(string_agg(label,',' ORDER BY label)
    FILTER (WHERE actual_candidate IS DISTINCT FROM expected_candidate),'none')
  FROM fixture_results
ORDER BY metric;
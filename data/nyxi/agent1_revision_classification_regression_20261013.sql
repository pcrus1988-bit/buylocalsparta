-- NYXI Agent 1 | #1460 / #1444 | 2026-10-13
-- READ ONLY. Source-revision triage; no rights grants, no publication, no DDL.
-- Raw HTML hash drift is not necessarily evidence drift. Hash arrays compare
-- extracted fragment content in stable ordinal order, NOT public rights.
-- Any evidence_revision_review or parser_or_extraction_drift_review needs human review.
-- This query does NOT independently rehash private Storage bytes.

WITH fragment_sets AS (
  SELECT s.id, s.source_id, s.fetched_at, s.sha256, src.source_key,
         COALESCE(array_agg(f.content_sha256 ORDER BY f.ordinal, f.id)
           FILTER (WHERE f.id IS NOT NULL), ARRAY[]::text[]) AS fragment_hashes
  FROM public.nyxi_source_snapshots s
  JOIN public.nyxi_sources src ON src.id = s.source_id
  LEFT JOIN public.nyxi_evidence_fragments f ON f.snapshot_id = s.id
  GROUP BY s.id, s.source_id, s.fetched_at, s.sha256, src.source_key
), pairs AS (
  SELECT *, lag(sha256) OVER (PARTITION BY source_id ORDER BY fetched_at, id) AS previous_sha,
            lag(fragment_hashes) OVER (PARTITION BY source_id ORDER BY fetched_at, id) AS previous_fragments
  FROM fragment_sets
), classified AS (
  SELECT *, CASE
    WHEN previous_sha IS NULL THEN 'baseline'
    WHEN cardinality(fragment_hashes) = 0 OR cardinality(previous_fragments) = 0 THEN 'needs_extraction'
    WHEN sha256 = previous_sha AND fragment_hashes = previous_fragments THEN 'raw_and_evidence_unchanged'
    WHEN sha256 <> previous_sha AND fragment_hashes = previous_fragments THEN 'raw_changed_evidence_same'
    WHEN sha256 = previous_sha AND fragment_hashes <> previous_fragments THEN 'parser_or_extraction_drift_review'
    ELSE 'evidence_revision_review'
  END AS revision_state FROM pairs
)
SELECT source_key, count(*) AS snapshots,
       count(*) FILTER (WHERE revision_state = 'raw_changed_evidence_same') AS raw_only_changes,
       count(*) FILTER (WHERE revision_state = 'evidence_revision_review') AS evidence_revision_candidates,
       count(*) FILTER (WHERE revision_state = 'parser_or_extraction_drift_review') AS parser_drift_candidates,
       count(*) FILTER (WHERE revision_state = 'needs_extraction') AS extraction_gaps,
       count(*) FILTER (WHERE revision_state = 'raw_and_evidence_unchanged') AS unchanged,
       max(fetched_at) AS latest_fetch
FROM classified GROUP BY source_key ORDER BY source_key;

-- Synthetic classification regression: six cases must all pass.
WITH fixture(label, prev_raw, raw, prev_frag, frag, expected) AS (
 VALUES
 ('baseline', NULL::text, 'a'::text, NULL::text[], ARRAY['x']::text[], 'baseline'),
 ('missing_extraction', 'a', 'b', ARRAY['x']::text[], ARRAY[]::text[], 'needs_extraction'),
 ('unchanged', 'a', 'a', ARRAY['x']::text[], ARRAY['x']::text[], 'raw_and_evidence_unchanged'),
 ('html_noise', 'a', 'b', ARRAY['x']::text[], ARRAY['x']::text[], 'raw_changed_evidence_same'),
 ('parser_drift', 'a', 'a', ARRAY['x']::text[], ARRAY['y']::text[], 'parser_or_extraction_drift_review'),
 ('content_revision', 'a', 'b', ARRAY['x']::text[], ARRAY['y']::text[], 'evidence_revision_review')
), result AS (
 SELECT label, expected, CASE
  WHEN prev_raw IS NULL THEN 'baseline'
  WHEN cardinality(frag) = 0 OR cardinality(prev_frag) = 0 THEN 'needs_extraction'
  WHEN raw = prev_raw AND frag = prev_frag THEN 'raw_and_evidence_unchanged'
  WHEN raw <> prev_raw AND frag = prev_frag THEN 'raw_changed_evidence_same'
  WHEN raw = prev_raw AND frag <> prev_frag THEN 'parser_or_extraction_drift_review'
  ELSE 'evidence_revision_review'
 END AS actual FROM fixture
)
SELECT count(*) AS cases, count(*) FILTER (WHERE actual = expected) AS passed,
       array_agg(label) FILTER (WHERE actual <> expected) AS failures
FROM result;

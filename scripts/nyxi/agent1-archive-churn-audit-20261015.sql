-- NYXI Agent 1: read-only metadata/hash-set archive churn census.
-- A different recorded archive hash with identical extracted fragments is NOT
-- proof that source bytes are unchanged. Never infer rights from this output.
WITH per_snapshot AS (
 SELECT s.id, s.source_id, s.fetched_at, s.sha256,
        COALESCE(array_agg(f.content_sha256 ORDER BY f.content_sha256)
          FILTER (WHERE f.id IS NOT NULL), ARRAY[]::text[]) AS fragment_hashes
 FROM public.nyxi_source_snapshots s
 LEFT JOIN public.nyxi_evidence_fragments f ON f.snapshot_id=s.id
 GROUP BY s.id
), transitions AS (
 SELECT *, lag(sha256) OVER w AS previous_sha,
        lag(fragment_hashes) OVER w AS previous_fragments
 FROM per_snapshot
 WINDOW w AS (PARTITION BY source_id ORDER BY fetched_at, id)
)
SELECT count(*) FILTER (WHERE previous_sha IS NOT NULL) AS comparisons,
 count(*) FILTER (WHERE previous_sha IS NOT NULL AND sha256<>previous_sha) AS changed_recorded_archive_hashes,
 count(*) FILTER (WHERE previous_sha IS NOT NULL AND fragment_hashes=previous_fragments) AS identical_extracted_fragment_multisets,
 count(*) FILTER (WHERE previous_sha IS NOT NULL AND fragment_hashes<>previous_fragments) AS changed_extracted_fragment_multisets
FROM transitions;

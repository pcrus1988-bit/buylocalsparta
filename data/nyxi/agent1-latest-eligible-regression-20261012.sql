-- NYXI Agent 1: read-only latest-eligible / raw-latest regression, 2026-10-12.
-- Safe: SELECT only. No private evidence or hashes emitted.
-- IMPORTANT: A snapshot's eligibility is determined by nyxi_valid_snapshots_v1,
-- which enforces exact-asset approvals, review/expiry and archival provenance.
-- This test does not authorize acquisition or prescribe a production migration.

-- Test 1: production invariant; zero rows indicate no currently affected sources.
WITH raw_latest AS (
 SELECT DISTINCT ON (source_id) id,source_id
 FROM public.nyxi_source_snapshots
 ORDER BY source_id,fetched_at DESC,id DESC
), eligible AS (
 SELECT source_id,
        count(*) AS eligible_snapshots,
        count(*) FILTER (WHERE latest_snapshot) AS latest_flag_count
 FROM public.nyxi_valid_snapshots_v1 GROUP BY source_id
)
SELECT e.source_id,e.eligible_snapshots,e.latest_flag_count,
       (r.id IS NOT NULL AND v.snapshot_id IS NULL) AS newest_raw_invalid
FROM eligible e
JOIN raw_latest r ON r.source_id=e.source_id
LEFT JOIN public.nyxi_valid_snapshots_v1 v ON v.snapshot_id=r.id
WHERE e.latest_flag_count<>1 OR v.snapshot_id IS NULL;

-- Test 2: synthetic negative case, independent of production rows.
-- Newest raw snapshot invalid: current view's raw-latest flag would yield 0,
-- while eligible-only latest ranking would yield 1.
WITH synthetic(source_key,version_no,is_eligible) AS (
 VALUES ('test-source',1,true),('test-source',2,false)
), labeled AS (
 SELECT s.*,
   version_no=(SELECT max(x.version_no) FROM synthetic x WHERE x.source_key=s.source_key) AS raw_latest,
   version_no=(SELECT max(x.version_no) FROM synthetic x WHERE x.source_key=s.source_key AND x.is_eligible) AS eligible_latest
 FROM synthetic s
)
SELECT count(*) FILTER(WHERE is_eligible AND raw_latest) AS raw_latest_eligible_count,
       count(*) FILTER(WHERE is_eligible AND eligible_latest) AS eligible_latest_count
FROM labeled;

-- Review decision before implementation: fail-closed empty results for invalid
-- newest snapshot, OR fallback to newest eligible archived version with explicit
-- staleness metadata. Never silently label an older version as current.

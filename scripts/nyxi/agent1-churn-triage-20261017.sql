-- NYXI Agent 1: READ-ONLY metadata-only archive churn audit, 2026-10-17.
-- Never publish fragments, grant rights, overwrite or delete archived originals.
-- Archive hashes below are RECORDED metadata, not independently rehashed bytes.
-- For Agent 2 (exact snapshot IDs) and Agent 4 (publication remains HOLD).
WITH per_snapshot AS (
  SELECT ss.id AS snapshot_id, ss.source_id, s.source_key, ss.fetched_at,
         ss.sha256 AS recorded_archive_sha256, ss.byte_length,
         ss.etag, ss.last_modified, count(f.id) AS fragment_count,
         encode(digest(coalesce(string_agg(
           f.ordinal::text || ':' || f.content_sha256, '|' ORDER BY f.ordinal, f.id
         ), ''), 'sha256'), 'hex') AS ordered_fragment_sha256
  FROM public.nyxi_source_snapshots ss
  JOIN public.nyxi_sources s ON s.id = ss.source_id
  LEFT JOIN public.nyxi_evidence_fragments f ON f.snapshot_id = ss.id
  GROUP BY ss.id, ss.source_id, s.source_key, ss.fetched_at,
           ss.sha256, ss.byte_length, ss.etag, ss.last_modified
), compared AS (
  SELECT *,
    lag(snapshot_id) OVER w AS previous_snapshot_id,
    lag(recorded_archive_sha256) OVER w AS previous_archive_sha256,
    lag(ordered_fragment_sha256) OVER w AS previous_fragment_sha256,
    lag(fragment_count) OVER w AS previous_fragment_count,
    lag(etag) OVER w AS previous_etag,
    lag(last_modified) OVER w AS previous_last_modified
  FROM per_snapshot
  WINDOW w AS (PARTITION BY source_id ORDER BY fetched_at, snapshot_id)
)
SELECT source_key, previous_snapshot_id, snapshot_id, fetched_at,
       recorded_archive_sha256, byte_length, fragment_count,
       CASE
         WHEN recorded_archive_sha256 = previous_archive_sha256
           THEN 'REPEATED_RECORDED_ARCHIVE_HASH'
         WHEN ordered_fragment_sha256 = previous_fragment_sha256
          AND fragment_count = previous_fragment_count
          AND etag IS NOT DISTINCT FROM previous_etag
          AND last_modified IS NOT DISTINCT FROM previous_last_modified
           THEN 'HASH_CHANGED_SAME_EXTRACTION_AND_VALIDATORS'
         WHEN ordered_fragment_sha256 = previous_fragment_sha256
          AND fragment_count = previous_fragment_count
           THEN 'HASH_CHANGED_SAME_EXTRACTION'
         WHEN etag IS NOT DISTINCT FROM previous_etag
          AND last_modified IS NOT DISTINCT FROM previous_last_modified
           THEN 'HASH_AND_EXTRACTION_CHANGED_WITH_SAME_VALIDATORS'
         ELSE 'EXTRACTED_CONTENT_CHANGED'
       END AS review_reason,
       'HOLD'::text AS publication_decision
FROM compared WHERE previous_snapshot_id IS NOT NULL
ORDER BY source_key, fetched_at, snapshot_id;

-- Source rights triage: absence of an acquisition approval is NOT permission
-- to acquire. Existing agent-attributed records do not clear publication.
SELECT s.source_key, s.authority, s.canonical_url,
       count(a.id) AS recorded_acquisition_rows,
       coalesce(bool_or(a.acquisition_authorized), false) AS recorded_acquisition_authorized,
       coalesce(bool_or(a.mirror_authorized), false) AS recorded_mirror_authorized,
       coalesce(bool_or(a.id IS NOT NULL AND a.retention_until IS NULL), false) AS missing_retention_deadline,
       coalesce(bool_or(a.approved_by ~* '(agent|bot|automation)'), false) AS agent_attributed_approval,
       'HOLD'::text AS publication_decision
FROM public.nyxi_sources s
LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.source_id = s.id
WHERE s.status = 'active'
GROUP BY s.id, s.source_key, s.authority, s.canonical_url
ORDER BY s.authority, s.source_key;

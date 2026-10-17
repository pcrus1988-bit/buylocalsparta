-- NYXI Agent 1 / Agent 4: read-only source-rights triage.
-- This is an evidence-gap report, NEVER an authorization or publication decision.
-- A source's active status and a recorded approval do not prove independently
-- verified rights-document bytes or authorize any public fragment.
WITH rights AS (
 SELECT s.id AS source_id, s.source_key, s.status,
        count(a.id) AS approval_records,
        count(a.id) FILTER (
          WHERE a.acquisition_authorized IS TRUE
            AND a.expires_at > now()
            AND a.review_due_at > now()
        ) AS current_acquisition_records,
        count(a.id) FILTER (
          WHERE a.acquisition_authorized IS TRUE
            AND a.expires_at > now()
            AND a.review_due_at > now()
            AND a.retention_until > now()
        ) AS retention_bounded_records,
        count(a.id) FILTER (WHERE a.mirror_authorized IS TRUE) AS recorded_mirror_flags
 FROM public.nyxi_sources s
 LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.source_id = s.id
 WHERE s.status = 'active'
 GROUP BY s.id, s.source_key, s.status
)
SELECT source_id, source_key, approval_records, current_acquisition_records,
       retention_bounded_records, recorded_mirror_flags,
       CASE WHEN current_acquisition_records = 0 THEN 'HUMAN_ACQUISITION_REVIEW'
            WHEN retention_bounded_records = 0 THEN 'HUMAN_RETENTION_REVIEW'
            ELSE 'ACQUISITION_ONLY_NOT_PUBLICATION' END AS human_triage
FROM rights
ORDER BY human_triage, source_key;

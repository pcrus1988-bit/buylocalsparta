-- NYXI Agent 1 / Agent 4: read-only source-rights triage.
-- This is an evidence gap report, NEVER an authorization or publication decision.
-- Active/discovered status alone is not a rights grant. No private fragments are read.
WITH rights AS (
 SELECT s.id AS source_id, s.source_key, s.status,
        count(a.id) AS approval_records,
        count(a.id) FILTER (WHERE a.acquisition_authorized IS TRUE) AS acquisition_grants,
        count(a.id) FILTER (WHERE a.acquisition_authorized IS TRUE
                              AND a.retention_until > now()) AS bounded_grants,
        count(a.id) FILTER (WHERE a.mirror_authorized IS TRUE) AS mirror_grants
 FROM public.nyxi_sources s
 LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.source_id = s.id
 WHERE s.status = 'active'
 GROUP BY s.id, s.source_key, s.status
)
SELECT source_id, source_key, approval_records, acquisition_grants,
       bounded_grants, mirror_grants,
       CASE WHEN acquisition_grants = 0 THEN 'HUMAN_ACQUISITION_REVIEW'
            WHEN bounded_grants = 0 THEN 'HUMAN_RETENTION_REVIEW'
            ELSE 'ACQUISITION_ONLY_NOT_PUBLICATION' END AS human_triage
FROM rights
ORDER BY human_triage, source_key;

-- Production migration 2026-10-19; private acquisition incident dashboard.
-- Source metadata, rights approvals, original archived snapshots and failures
-- are intentionally separate. A blocked origin is not permission to bypass it.
CREATE OR REPLACE VIEW public.nyxi_private_acquisition_incidents_v1
WITH (security_invoker=true) AS
SELECT
 s.source_key,s.title,s.authority,s.jurisdiction,s.source_role,s.canonical_url,
 i.intake_stage,i.archived_versions,a.id AS approval_id,
 a.asset_kind,a.acquisition_method,a.acquisition_authorized,
 a.expires_at AS approval_expires_at,a.review_due_at,
 a.metadata->>'last_worker_attempt_at' AS last_attempt_at,
 a.metadata->>'last_worker_error' AS last_error_code,
 a.metadata->>'last_worker_error_detail' AS last_error_detail,
 (a.metadata->>'last_worker_http_status')::integer AS collector_http_status,
 (a.metadata->>'last_worker_upstream_http_status')::integer AS upstream_http_status,
 coalesce(a.metadata->>'last_worker_failure_class','unclassified') AS failure_class,
 coalesce((a.metadata->>'collector_failure_count')::integer,0) AS failure_count,
 coalesce((a.metadata->>'needs_manual_access_review')::boolean,false) AS manual_access_review_required,
 a.metadata->>'manual_access_review_reason' AS manual_access_review_reason,
 a.metadata->>'next_attempt_after' AS next_attempt_after,
 CASE
   WHEN coalesce((a.metadata->>'needs_manual_access_review')::boolean,false)
     THEN 'manual_permission_or_access_review'
   WHEN i.archived_versions>0 THEN 'captured_verify_and_extract'
   WHEN a.metadata->>'last_worker_error'='upstream_status'
     THEN 'inspect_upstream_status_and_access_terms'
   WHEN a.metadata->>'last_worker_error'='collector_error'
     THEN 'inspect_collector_network_and_tls_failure'
   WHEN a.metadata->>'last_worker_error'='redirect_rejected'
     THEN 'verify_exact_redirect_and_new_asset_rights'
   WHEN a.metadata->>'last_worker_error' IS NOT NULL
     THEN 'triage_failed_source'
   ELSE 'approved_waiting_first_capture'
 END AS recommended_next_action,
 false AS permission_to_bypass_website_access_controls
FROM public.nyxi_asset_acquisition_approvals a
JOIN public.nyxi_sources s ON s.id=a.source_id
JOIN public.nyxi_source_intake_status_v1 i ON i.source_id=s.id
WHERE a.acquisition_authorized
 AND (a.metadata ? 'last_worker_error' OR i.intake_stage='approved_waiting_capture');
REVOKE ALL ON public.nyxi_private_acquisition_incidents_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_acquisition_incidents_v1 TO service_role;

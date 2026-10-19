-- Already applied to production as migration 20261019051606.
-- Discovery URL != permitted extraction. This is a private review queue only.
CREATE OR REPLACE VIEW public.nyxi_private_manufacturer_acquisition_queue_v1
WITH (security_invoker=true) AS
SELECT
 p.publisher_key,p.publisher_name,p.identity_status,
 s.id AS source_id,s.source_key,s.title,s.source_role,s.canonical_url,s.priority,
 i.registry_status,i.intake_stage,i.rights_review_status,
 i.authorized_assets,i.archived_versions,i.evidence_fragments,
 coalesce(s.metadata->>'rights_policy_url','') AS rights_policy_url,
 i.last_collector_error,
 CASE
  WHEN i.intake_stage='permission_required' THEN 'obtain_asset_specific_permission'
  WHEN i.intake_stage='restricted' THEN 'do_not_fetch'
  WHEN i.intake_stage='approved_waiting_capture' THEN 'investigate_collector_retry'
  WHEN i.intake_stage='archived_private' THEN 'extract_and_independently_review'
  ELSE 'review_exact_asset_rights_and_robots'
 END AS next_action,
 CASE
  WHEN s.source_role='manufacturer_sds' THEN 'SDS_safety'
  WHEN s.source_role='manufacturer_product' THEN 'exact_product_identity'
  WHEN s.source_role='manufacturer_catalogue' THEN 'brand_line_shade_catalogue'
  ELSE 'publisher_identity'
 END AS intake_workstream,
 false AS automatic_capture_authorized_by_this_view
FROM public.nyxi_nail_publisher_sources_v1 ps
JOIN public.nyxi_nail_brand_publishers_v1 p ON p.id=ps.publisher_id
JOIN public.nyxi_sources s ON s.id=ps.source_id
JOIN public.nyxi_source_intake_status_v1 i ON i.source_id=s.id
WHERE ps.review_status<>'rejected';
REVOKE ALL ON public.nyxi_private_manufacturer_acquisition_queue_v1
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_manufacturer_acquisition_queue_v1 TO service_role;

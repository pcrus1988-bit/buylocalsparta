-- Rights analysis completed 19 Oct 2026 against official manufacturer policies.
-- Link-only Atlas registration preserved. NO automatic acquisition authorised.
-- Akzentz terms: https://akzentz.com/policies/terms-of-service
-- Manucurist notice: https://www.manucurist.com/policies/legal-notice
UPDATE public.nyxi_sources s
SET metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object(
 'rights_review_status','permission_required_for_automated_acquisition',
 'rights_review_basis',CASE WHEN s.authority='Akzentz'
 THEN 'Official Akzentz terms prohibit reproduction, reuse, exploitation or copying without prior written permission; includes linked SDS for reuse.'
 ELSE 'Manucurist official legal notice prohibits reproduction, modification, publication or adaption of site material without prior written authorisation.' END,
 'rights_policy_url',CASE WHEN s.authority='Akzentz'
 THEN 'https://akzentz.com/policies/terms-of-service'
 ELSE 'https://www.manucurist.com/policies/legal-notice' END,
 'rights_reviewed_at','2026-10-19',
 'acquisition_rights_guardrail','Obtain written permission for commercial automated copying, SDS archiving, branded shade reuse, or derivatives; keep official reference URLs',
 'requested_scope','licensed SKU + INCI + SDS + named shade swatch feed, updates, attribution and private archive',
 'permission_request_prepared',true),
 updated_at=now()
WHERE s.authority IN('Akzentz','Manucurist')
 AND s.source_role LIKE 'manufacturer%' AND s.status='discovered'
 AND coalesce(s.metadata->>'rights_review_status','not_reviewed')<>'permission_required_for_automated_acquisition';

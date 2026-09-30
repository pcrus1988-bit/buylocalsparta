-- Deterministic Paint & Build / VITEX coverage audit.
-- Read-only. Production-safe. A commerce row is reachable only through reviewed Layer C
-- plus current verified manufacturer profile/rule/evidence. Keyword terms are never a gate.
WITH scenarios AS (
  SELECT id, scenario_key, substrate, interior_exterior
  FROM public.build_solution_profiles
  WHERE published=true AND review_status='approved' AND evidence_status='verified'
),
assigned AS (
  SELECT DISTINCT vcp.id commerce_id,vcp.import_fingerprint,vcp.match_status,
    vcp.manufacturer_product_id,vcp.canonical_variant_id
  FROM public.vitex_commerce_products vcp
  JOIN public.catalog_source_products csp ON csp.source_product_key=vcp.import_fingerprint
  JOIN public.catalog_sources cs ON cs.id=csp.source_id AND cs.code='vitex-commerce-media' AND cs.active=true
  JOIN public.vendor_catalog_assortments vca ON vca.source_product_id=csp.id
    AND vca.assortment_status NOT IN ('rejected','discontinued')
  WHERE vcp.active=true
),
positive AS (
  SELECT DISTINCT s.scenario_key,ar.product_id
  FROM scenarios s
  JOIN public.manufacturer_application_rules ar ON ar.active=true
    AND ar.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
    AND (ar.valid_from IS NULL OR ar.valid_from<=CURRENT_DATE)
    AND (ar.valid_to IS NULL OR ar.valid_to>=CURRENT_DATE)
    AND public.jsonb_condition_matches(
      jsonb_build_object('scenario_key',s.scenario_key,'substrate',s.substrate,'interior_exterior',s.interior_exterior),
      ar.condition_expression)
  JOIN public.manufacturer_products mp ON mp.id=ar.product_id
    AND mp.verification_status='verified' AND mp.product_system_status='current'
    AND (mp.valid_from IS NULL OR mp.valid_from<=CURRENT_DATE)
    AND (mp.valid_to IS NULL OR mp.valid_to>=CURRENT_DATE)
  JOIN public.manufacturer_application_profiles ap ON ap.product_id=mp.id
    AND ap.source_layer='manufacturer' AND ap.verification_status='verified' AND ap.is_current=true
    AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
    AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
  JOIN public.manufacturer_instruction_evidence ie ON ie.id=ar.source_evidence_id AND ie.is_current=true
  JOIN public.manufacturer_technical_sources ts ON ts.id=ie.source_id AND ts.is_current=true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.manufacturer_application_rules blocked
    WHERE blocked.product_id=ar.product_id AND blocked.active=true
      AND blocked.result_status IN ('not_recommended','blocked')
      AND (blocked.valid_from IS NULL OR blocked.valid_from<=CURRENT_DATE)
      AND (blocked.valid_to IS NULL OR blocked.valid_to>=CURRENT_DATE)
      AND public.jsonb_condition_matches(
        jsonb_build_object('scenario_key',s.scenario_key,'substrate',s.substrate,'interior_exterior',s.interior_exterior),
        blocked.condition_expression)
  )
),
classified AS (
 SELECT a.*,
   mp.product_name,mp.verification_status,mp.product_system_status,
   CASE
    WHEN a.match_status='review_required' THEN 'review_required'
    WHEN a.manufacturer_product_id IS NULL THEN 'manufacturer_identity_unresolved'
    WHEN mp.id IS NULL THEN 'manufacturer_identity_unresolved'
    WHEN mp.product_system_status IS DISTINCT FROM 'current' THEN 'superseded_or_discontinued'
    WHEN mp.verification_status IS DISTINCT FROM 'verified' THEN 'technical_profile_unverified'
    WHEN NOT EXISTS (SELECT 1 FROM public.manufacturer_application_profiles ap WHERE ap.product_id=mp.id AND ap.source_layer='manufacturer' AND ap.verification_status='verified' AND ap.is_current=true) THEN 'technical_profile_unverified'
    WHEN EXISTS (SELECT 1 FROM positive p WHERE p.product_id=mp.id) THEN 'reachable_verified'
    WHEN EXISTS (SELECT 1 FROM public.manufacturer_application_rules ar WHERE ar.product_id=mp.id AND ar.active=true AND ar.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')) THEN 'verified_but_no_matching_reviewed_pathway'
    ELSE 'verified_but_no_positive_pathway_rule'
   END coverage_state
 FROM assigned a LEFT JOIN public.manufacturer_products mp ON mp.id=a.manufacturer_product_id
)
SELECT coverage_state,count(*) commerce_variants,count(DISTINCT manufacturer_product_id) manufacturer_products
FROM classified GROUP BY coverage_state ORDER BY commerce_variants DESC;

-- Pathway coverage. Zero rows are intentional and visible, never silently omitted.
WITH scenarios AS (
 SELECT scenario_key,substrate,interior_exterior FROM public.build_solution_profiles
 WHERE published=true AND review_status='approved' AND evidence_status='verified'
), positive AS (
 SELECT DISTINCT s.scenario_key,ar.product_id
 FROM scenarios s JOIN public.manufacturer_application_rules ar ON ar.active=true
  AND ar.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
  AND public.jsonb_condition_matches(jsonb_build_object('scenario_key',s.scenario_key,'substrate',s.substrate,'interior_exterior',s.interior_exterior),ar.condition_expression)
 JOIN public.manufacturer_products mp ON mp.id=ar.product_id AND mp.verification_status='verified' AND mp.product_system_status='current'
 JOIN public.manufacturer_application_profiles ap ON ap.product_id=mp.id AND ap.verification_status='verified' AND ap.is_current=true
 JOIN public.manufacturer_instruction_evidence ie ON ie.id=ar.source_evidence_id AND ie.is_current=true
 JOIN public.manufacturer_technical_sources ts ON ts.id=ie.source_id AND ts.is_current=true
)
SELECT s.scenario_key,count(DISTINCT p.product_id) reachable_families
FROM scenarios s LEFT JOIN positive p USING(scenario_key)
GROUP BY s.scenario_key ORDER BY s.scenario_key;
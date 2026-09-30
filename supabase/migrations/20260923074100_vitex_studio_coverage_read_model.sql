CREATE OR REPLACE VIEW public.admin_vitex_studio_coverage
WITH (security_invoker = true)
AS
SELECT
  vc.id AS commerce_id,
  vc.product_title,
  vc.active AS commerce_active,
  vc.match_status,
  vc.match_confidence,
  vc.manufacturer_product_id,
  mp.product_name AS manufacturer_product_name,
  vc.manufacturer_variant_id,
  vc.canonical_product_family_id,
  vc.canonical_variant_id,
  EXISTS (
    SELECT 1 FROM public.manufacturer_application_profiles ap
    WHERE ap.product_id=vc.manufacturer_product_id
      AND ap.source_layer='manufacturer'
      AND ap.verification_status='verified'
      AND ap.is_current
      AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
      AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
  ) AS has_verified_application_profile,
  COALESCE((
    SELECT jsonb_agg(DISTINCT r.condition_expression->>'scenario_key')
    FROM public.manufacturer_application_rules r
    JOIN public.manufacturer_instruction_evidence ie ON ie.id=r.source_evidence_id AND ie.is_current
    WHERE r.product_id=vc.manufacturer_product_id
      AND r.active
      AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
      AND r.condition_expression ? 'scenario_key'
      AND EXISTS (
        SELECT 1 FROM public.build_solution_profiles bsp
        WHERE bsp.scenario_key=r.condition_expression->>'scenario_key'
          AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
      )
  ), '[]'::jsonb) AS reviewed_positive_scenarios,
  CASE
    WHEN NOT vc.active THEN 'inactive'
    WHEN vc.manufacturer_product_id IS NULL OR vc.match_status='unmatched' THEN 'unmatched'
    WHEN vc.match_status='review_required' THEN 'review_required'
    WHEN vc.match_status NOT IN ('verified','product_matched') THEN 'manufacturer_identity_unresolved'
    WHEN mp.id IS NULL OR mp.product_system_status<>'current' OR mp.verification_status<>'verified' THEN 'technical_profile_unverified'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.manufacturer_application_profiles ap
      WHERE ap.product_id=vc.manufacturer_product_id AND ap.source_layer='manufacturer'
        AND ap.verification_status='verified' AND ap.is_current
        AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
        AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
    ) THEN 'technical_profile_unverified'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.manufacturer_application_rules r
      JOIN public.manufacturer_instruction_evidence ie ON ie.id=r.source_evidence_id AND ie.is_current
      JOIN public.build_solution_profiles bsp ON bsp.scenario_key=r.condition_expression->>'scenario_key'
      WHERE r.product_id=vc.manufacturer_product_id AND r.active
        AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
        AND r.condition_expression ? 'scenario_key'
        AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
    ) THEN 'verified_but_no_positive_pathway_rule'
    ELSE 'reachable_verified'
  END AS coverage_state
FROM public.vitex_commerce_products vc
LEFT JOIN public.manufacturer_products mp ON mp.id=vc.manufacturer_product_id;

REVOKE ALL ON public.admin_vitex_studio_coverage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_vitex_studio_coverage TO service_role;

COMMENT ON VIEW public.admin_vitex_studio_coverage IS
'Server-only deterministic VITEX Studio coverage classification. Reachability requires verified identity/profile plus an evidenced positive rule explicitly bound to an approved verified scenario.';

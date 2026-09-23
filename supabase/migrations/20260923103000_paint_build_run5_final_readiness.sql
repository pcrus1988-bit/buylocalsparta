-- Paint & Build integration sprint Run 5 / final readiness.
-- Keeps technical advice fail-closed: only verified commerce identity may inherit
-- manufacturer guidance. System components are audited separately from main candidates.

UPDATE public.manufacturer_products mp
SET verification_status='verified',
    last_verified_at=now(),
    updated_at=now()
WHERE mp.id = ANY(ARRAY[
  '0e3b442d-bf1d-4777-a737-353b0c051921'::uuid, -- Vista Emulsion
  'cd557ba6-5963-4d08-b70e-ae16589afa03'::uuid, -- Chassis Coat
  'afcc18a4-e6c6-4173-960c-c811f596745f'::uuid, -- Metal Primer
  'bbbb7344-e077-4ca7-aa85-15d79b2f7ac7'::uuid  -- Minio Primer
])
AND mp.product_system_status='current'
AND EXISTS (
  SELECT 1
  FROM public.manufacturer_application_profiles ap
  JOIN public.manufacturer_technical_sources ts ON ts.id=ap.primary_source_id
  WHERE ap.product_id=mp.id
    AND ap.source_layer='manufacturer'
    AND ap.verification_status='verified'
    AND ap.is_current
    AND ts.is_current
    AND lower(ts.manufacturer)='vitex'
    AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
    AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
)
AND EXISTS (
  SELECT 1
  FROM public.vitex_commerce_products vc
  WHERE vc.manufacturer_product_id=mp.id
    AND vc.active
    AND vc.match_status='verified'
    AND vc.canonical_variant_id IS NOT NULL
    AND vc.price_minor>0
);

UPDATE public.manufacturer_application_rules
SET active=false
WHERE rule_key='acrylan_unco_exterior_new_plaster_component'
  AND active=true;

UPDATE public.manufacturer_application_rules
SET actions=jsonb_set(actions,'{required_primer}','"Velatura Eco Water"'::jsonb,true)
WHERE rule_key='run4_aquavit_eco_wood_bare'
  AND active=true
  AND actions->>'required_primer'='Velatura Eco';

WITH desired(product_id,rule_key,condition_expression,result_status,actions,priority,evidence_id) AS (
  VALUES
  ('0e3b442d-bf1d-4777-a737-353b0c051921'::uuid,
   'run5_vista_emulsion_interior_repaint_sound',
   '{"scenario_key":"paint_interior_repaint_sound"}'::jsonb,
   'eligible',
   '{"message":"Vista Emulsion is documented for interior concrete, plaster, brick, plasterboard and sound old paint; current VITEX preparation requirements still apply."}'::jsonb,
   70,
   'b9fcaa48-594c-4ead-a897-6ba320c31efe'::uuid),
  ('0e3b442d-bf1d-4777-a737-353b0c051921'::uuid,
   'run5_vista_emulsion_interior_new_plaster',
   '{"scenario_key":"paint_interior_new_plaster"}'::jsonb,
   'requires_specific_primer',
   '{"primer_options":["Primer 100% Acrylic","Acrylan Unco Eco"]}'::jsonb,
   80,
   '6b9be466-b75a-40b4-8270-14a8223b1277'::uuid),
  ('0e3b442d-bf1d-4777-a737-353b0c051921'::uuid,
   'run5_vista_emulsion_interior_new_gypsum',
   '{"scenario_key":"paint_interior_new_gypsum_board"}'::jsonb,
   'requires_specific_primer',
   '{"primer_options":["Primer 100% Acrylic","Acrylan Unco Eco"]}'::jsonb,
   80,
   '6b9be466-b75a-40b4-8270-14a8223b1277'::uuid),
  ('0e3b442d-bf1d-4777-a737-353b0c051921'::uuid,
   'run5_vista_emulsion_interior_stained',
   '{"scenario_key":"paint_interior_stained"}'::jsonb,
   'requires_specific_primer',
   '{"primer_options":["Blanco Eco","Vitosin"]}'::jsonb,
   80,
   'b31fd5a6-31fe-40fc-887e-3fa62e118719'::uuid),
  ('cd557ba6-5963-4d08-b70e-ae16589afa03'::uuid,
   'run5_chassis_coat_bare_ferrous',
   '{"scenario_key":"paint_metal_bare_ferrous"}'::jsonb,
   'eligible_with_preparation',
   '{"message":"Chassis Coat is documented for vehicle chassis and new metal surfaces and can also serve as an anticorrosive undercoat. The metal must be properly prepared, smooth, dry and rust-free."}'::jsonb,
   70,
   'dad63cd1-73b5-4fa7-9353-382f3f16cf3a'::uuid)
)
INSERT INTO public.manufacturer_application_rules
(product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,actions,priority,source_evidence_id,valid_from,active)
SELECT d.product_id,d.rule_key,'manufacturer','run5-2026-09-23',
       d.condition_expression,d.result_status,d.actions,d.priority,d.evidence_id,CURRENT_DATE,true
FROM desired d
JOIN public.manufacturer_products mp
  ON mp.id=d.product_id
 AND mp.product_system_status='current'
 AND mp.verification_status='verified'
JOIN public.manufacturer_instruction_evidence ie
  ON ie.id=d.evidence_id
 AND ie.product_id=d.product_id
 AND ie.is_current
 AND ie.source_layer='manufacturer'
JOIN public.manufacturer_technical_sources ts
  ON ts.id=ie.source_id
 AND ts.is_current
WHERE NOT EXISTS (
  SELECT 1
  FROM public.manufacturer_application_rules existing
  WHERE existing.product_id=d.product_id
    AND existing.rule_key=d.rule_key
);

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
    JOIN public.manufacturer_instruction_evidence ie
      ON ie.id=r.source_evidence_id AND ie.is_current
    JOIN public.manufacturer_technical_sources ts
      ON ts.id=ie.source_id AND ts.is_current
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
    WHEN vc.match_status<>'verified' THEN 'manufacturer_identity_unresolved'
    WHEN mp.id IS NULL OR mp.product_system_status<>'current' OR mp.verification_status<>'verified' THEN 'technical_profile_unverified'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.manufacturer_application_profiles ap
      WHERE ap.product_id=vc.manufacturer_product_id
        AND ap.source_layer='manufacturer'
        AND ap.verification_status='verified'
        AND ap.is_current
        AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
        AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
    ) THEN 'technical_profile_unverified'
    WHEN EXISTS (
      SELECT 1
      FROM public.manufacturer_application_rules r
      JOIN public.manufacturer_instruction_evidence ie
        ON ie.id=r.source_evidence_id AND ie.is_current
      JOIN public.manufacturer_technical_sources ts
        ON ts.id=ie.source_id AND ts.is_current
      JOIN public.build_solution_profiles bsp
        ON bsp.scenario_key=r.condition_expression->>'scenario_key'
      WHERE r.product_id=vc.manufacturer_product_id
        AND r.active
        AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
        AND r.condition_expression ? 'scenario_key'
        AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
    ) THEN 'reachable_verified'
    WHEN EXISTS (
      SELECT 1
      FROM public.manufacturer_application_rules r
      JOIN public.manufacturer_instruction_evidence ie
        ON ie.id=r.source_evidence_id AND ie.is_current
      JOIN public.manufacturer_technical_sources ts
        ON ts.id=ie.source_id AND ts.is_current
      JOIN public.build_solution_profiles bsp
        ON bsp.scenario_key=r.condition_expression->>'scenario_key'
      WHERE r.active
        AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
        AND r.condition_expression ? 'scenario_key'
        AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
        AND (
          r.actions->>'required_primer'=mp.product_name
          OR r.actions->>'required_component'=mp.product_name
          OR (COALESCE(r.actions->'primer_options','[]'::jsonb) ? mp.product_name)
          OR (COALESCE(r.actions->'required_components','[]'::jsonb) ? mp.product_name)
          OR (COALESCE(r.actions->'recommended_components','[]'::jsonb) ? mp.product_name)
        )
    ) THEN 'reachable_system_component'
    ELSE 'verified_but_no_positive_pathway_rule'
  END AS coverage_state,
  COALESCE((
    SELECT jsonb_agg(DISTINCT r.condition_expression->>'scenario_key')
    FROM public.manufacturer_application_rules r
    JOIN public.manufacturer_instruction_evidence ie
      ON ie.id=r.source_evidence_id AND ie.is_current
    JOIN public.manufacturer_technical_sources ts
      ON ts.id=ie.source_id AND ts.is_current
    WHERE r.active
      AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
      AND r.condition_expression ? 'scenario_key'
      AND (
        r.actions->>'required_primer'=mp.product_name
        OR r.actions->>'required_component'=mp.product_name
        OR (COALESCE(r.actions->'primer_options','[]'::jsonb) ? mp.product_name)
        OR (COALESCE(r.actions->'required_components','[]'::jsonb) ? mp.product_name)
        OR (COALESCE(r.actions->'recommended_components','[]'::jsonb) ? mp.product_name)
      )
      AND EXISTS (
        SELECT 1 FROM public.build_solution_profiles bsp
        WHERE bsp.scenario_key=r.condition_expression->>'scenario_key'
          AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
      )
  ), '[]'::jsonb) AS reviewed_component_scenarios
FROM public.vitex_commerce_products vc
LEFT JOIN public.manufacturer_products mp ON mp.id=vc.manufacturer_product_id;

REVOKE ALL ON public.admin_vitex_studio_coverage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_vitex_studio_coverage TO service_role;

COMMENT ON VIEW public.admin_vitex_studio_coverage IS
'Server-only VITEX Studio commerce coverage. Main recommendations require verified commerce identity; verified system components are tracked separately from finish-product pathways.';

CREATE OR REPLACE VIEW public.admin_vitex_studio_family_readiness
WITH (security_invoker = true)
AS
WITH family AS (
  SELECT
    mp.id AS manufacturer_product_id,
    mp.product_name,
    mp.product_category,
    mp.subcategory,
    mp.product_system_status,
    mp.verification_status,
    count(DISTINCT vc.id) FILTER (
      WHERE vc.active
        AND vc.match_status IN ('verified','product_matched')
        AND vc.canonical_variant_id IS NOT NULL
        AND vc.price_minor>0
    ) AS sellable_commerce_rows,
    count(DISTINCT vc.id) FILTER (
      WHERE vc.active
        AND vc.match_status='verified'
        AND vc.canonical_variant_id IS NOT NULL
        AND vc.price_minor>0
    ) AS exact_sellable_commerce_rows,
    EXISTS (
      SELECT 1
      FROM public.manufacturer_application_profiles ap
      JOIN public.manufacturer_technical_sources ts ON ts.id=ap.primary_source_id
      WHERE ap.product_id=mp.id
        AND ap.source_layer='manufacturer'
        AND ap.verification_status='verified'
        AND ap.is_current
        AND ts.is_current
        AND (ap.valid_from IS NULL OR ap.valid_from<=CURRENT_DATE)
        AND (ap.valid_to IS NULL OR ap.valid_to>=CURRENT_DATE)
    ) AS has_verified_current_profile,
    count(DISTINCT r.id) FILTER (
      WHERE r.active
        AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
        AND r.condition_expression ? 'scenario_key'
        AND EXISTS (
          SELECT 1 FROM public.build_solution_profiles bsp
          WHERE bsp.scenario_key=r.condition_expression->>'scenario_key'
            AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
        )
    ) AS direct_reviewed_scenario_rules
  FROM public.manufacturer_products mp
  LEFT JOIN public.vitex_commerce_products vc ON vc.manufacturer_product_id=mp.id
  LEFT JOIN public.manufacturer_application_rules r ON r.product_id=mp.id
  WHERE lower(mp.manufacturer)='vitex'
  GROUP BY mp.id,mp.product_name,mp.product_category,mp.subcategory,mp.product_system_status,mp.verification_status
)
SELECT
  f.*,
  (
    SELECT count(DISTINCT r.condition_expression->>'scenario_key')
    FROM public.manufacturer_application_rules r
    JOIN public.manufacturer_instruction_evidence ie
      ON ie.id=r.source_evidence_id AND ie.is_current
    JOIN public.manufacturer_technical_sources ts
      ON ts.id=ie.source_id AND ts.is_current
    JOIN public.build_solution_profiles bsp
      ON bsp.scenario_key=r.condition_expression->>'scenario_key'
     AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
    WHERE r.active
      AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
      AND r.condition_expression ? 'scenario_key'
      AND (
        r.actions->>'required_primer'=f.product_name
        OR r.actions->>'required_component'=f.product_name
        OR (COALESCE(r.actions->'primer_options','[]'::jsonb) ? f.product_name)
        OR (COALESCE(r.actions->'required_components','[]'::jsonb) ? f.product_name)
        OR (COALESCE(r.actions->'recommended_components','[]'::jsonb) ? f.product_name)
      )
  ) AS component_reviewed_scenarios,
  CASE
    WHEN f.sellable_commerce_rows=0 THEN 'commerce_missing'
    WHEN f.exact_sellable_commerce_rows=0 THEN 'manufacturer_identity_review_required'
    WHEN f.product_system_status<>'current'
      OR f.verification_status<>'verified'
      OR NOT f.has_verified_current_profile THEN 'technical_profile_unverified'
    WHEN f.direct_reviewed_scenario_rules>0 THEN 'direct_reachable'
    WHEN (
      SELECT count(*)
      FROM public.manufacturer_application_rules r
      JOIN public.build_solution_profiles bsp
        ON bsp.scenario_key=r.condition_expression->>'scenario_key'
       AND bsp.published AND bsp.review_status='approved' AND bsp.evidence_status='verified'
      WHERE r.active
        AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
        AND r.condition_expression ? 'scenario_key'
        AND (
          r.actions->>'required_primer'=f.product_name
          OR r.actions->>'required_component'=f.product_name
          OR (COALESCE(r.actions->'primer_options','[]'::jsonb) ? f.product_name)
          OR (COALESCE(r.actions->'required_components','[]'::jsonb) ? f.product_name)
          OR (COALESCE(r.actions->'recommended_components','[]'::jsonb) ? f.product_name)
        )
    )>0 THEN 'system_component_reachable'
    ELSE 'verified_but_no_reviewed_pathway'
  END AS readiness_state
FROM family f;

REVOKE ALL ON public.admin_vitex_studio_family_readiness FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_vitex_studio_family_readiness TO service_role;

COMMENT ON VIEW public.admin_vitex_studio_family_readiness IS
'Server-only manufacturer-family readiness audit for Paint & Build. Separates commerce absence, unresolved commerce identity, technical verification, main-candidate reachability and system-component reachability.';

DO $verify$
DECLARE
  v_missing text;
  v_primer_leaks integer;
BEGIN
  SELECT string_agg(expected.rule_key, ', ' ORDER BY expected.rule_key)
  INTO v_missing
  FROM (VALUES
    ('run5_vista_emulsion_interior_repaint_sound'),
    ('run5_vista_emulsion_interior_new_plaster'),
    ('run5_vista_emulsion_interior_new_gypsum'),
    ('run5_vista_emulsion_interior_stained'),
    ('run5_chassis_coat_bare_ferrous')
  ) AS expected(rule_key)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.manufacturer_application_rules r
    JOIN public.manufacturer_instruction_evidence ie ON ie.id=r.source_evidence_id AND ie.is_current
    JOIN public.manufacturer_technical_sources ts ON ts.id=ie.source_id AND ts.is_current
    WHERE r.rule_key=expected.rule_key AND r.active
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Run5 evidenced pathway rules missing: %', v_missing;
  END IF;

  SELECT count(*) INTO v_primer_leaks
  FROM public.manufacturer_application_rules r
  JOIN public.manufacturer_products mp ON mp.id=r.product_id
  WHERE r.active
    AND r.result_status IN ('eligible','eligible_with_preparation','requires_specific_primer','requires_system_component')
    AND r.condition_expression ? 'scenario_key'
    AND (
      lower(coalesce(mp.product_category,'')) LIKE '%primer%'
      OR lower(coalesce(mp.subcategory,'')) LIKE '%primer%'
    );

  IF v_primer_leaks<>0 THEN
    RAISE EXCEPTION 'Run5 main-candidate role audit found % primer scenario rules', v_primer_leaks;
  END IF;
END
$verify$;

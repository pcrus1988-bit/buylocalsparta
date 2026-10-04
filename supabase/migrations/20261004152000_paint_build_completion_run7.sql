-- Paint & Build Completion Run 7
-- 2026-10-04
-- Follow-up to Run 6. Evidence-first completion of the remaining VITEX backlog.
--
-- Principles:
--  * promote only identities directly confirmed by the current 2026 VITEX catalogue
--  * correct contaminated Visto catalogue evidence rather than layering new facts over bad facts
--  * verify products only where current manufacturer evidence is sufficient
--  * keep Wooden Floor Primer quarantined until its current portfolio status is resolved
--  * keep the generic "Αστάρι 3L λευκό" unmatched: insufficient product identity

-- 1. Resolve the five held Vito Eco commerce identities from the current 2026 catalogue.
UPDATE public.vitex_commerce_products
SET match_status='verified',
    match_confidence=0.99,
    match_method='catalogue_title_pack_verified',
    match_evidence=COALESCE(match_evidence,'{}'::jsonb) || jsonb_build_object(
      'completion_run','2026-10-04-run7',
      'verification_source','Vitex Product Catalogue GR 2026',
      'verification_url','https://www.vitex.gr/wp-content/uploads/2026/01/Vitex_Product_Catalogue_GR.pdf',
      'catalogue_evidence','Vito Eco: White 750mL/3L/9L/15L; bases W,M 1L/3L/9L'
    ),
    updated_at=now()
WHERE id IN (
  'f3a6fd75-11b4-48ed-8858-db8a09d884c5'::uuid,
  'b4b8f3c1-7787-4eec-8d56-6b8e1cad5d78'::uuid,
  '3400915d-a541-433a-bdd4-fac659edc177'::uuid,
  'd36ce841-a8a8-470d-9a71-7cf1e325772b'::uuid,
  '5fc55a52-483c-4f69-abea-c09e22717a46'::uuid
)
AND manufacturer_product_id='78548b0f-5dee-44fe-a82a-470acb0d8c41'::uuid
AND match_status='product_matched';

-- 2. Acrylic Putty: current TDS is complete enough for governed repair guidance.
UPDATE public.manufacturer_products
SET verification_status='verified',
    product_system_status='current',
    certifications='[{"mark":"CE","standard":"EN 15284"}]'::jsonb,
    last_verified_at=now(),
    updated_at=now()
WHERE id='fb9a5f39-1996-4123-9e8d-bdae7a9fe722'::uuid;

UPDATE public.manufacturer_application_profiles
SET verification_status='verified',
    profile_revision='TDS 12.2020 + Catalogue 2026',
    consumption_value_min=2,
    consumption_value_max=3,
    consumption_unit='m²/kg',
    dilution_required=false,
    application_methods=ARRAY['spatula']::text[],
    minimum_application_temperature_c=5,
    maximum_application_temperature_c=35,
    maximum_relative_humidity_percent=80,
    weather_restrictions=ARRAY['For exterior use, no rain/frost risk within 48 hours.']::text[],
    special_application_notes=ARRAY['Sand after 2-3 hours, remove dust, then apply the compatible topcoat.']::text[],
    last_verified_at=now(),
    updated_at=now()
WHERE product_id='fb9a5f39-1996-4123-9e8d-bdae7a9fe722'::uuid
  AND source_layer='manufacturer'
  AND is_current=true;

INSERT INTO public.manufacturer_package_sizes(
  product_id,variant_id,amount,unit,package_label,source_evidence_id,active
)
SELECT mp.id,NULL,v.amount,'kg',v.label,ie.id,true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id
 AND ie.evidence_fingerprint='90e792262f33277ccd25eebcb710e61e83ee244c4888a85dbb6945ce9d1143d4'
 AND ie.is_current=true
CROSS JOIN (VALUES
  (0.4::numeric,'White 400 g'),
  (0.8::numeric,'White 800 g'),
  (5::numeric,'White 5 kg')
) v(amount,label)
WHERE mp.manufacturer_key='acrylic-putty'
  AND NOT EXISTS (
    SELECT 1 FROM public.manufacturer_package_sizes ps
    WHERE ps.product_id=mp.id
      AND ps.variant_id IS NULL
      AND ps.amount=v.amount
      AND lower(ps.unit)='kg'
      AND ps.active=true
  );

INSERT INTO public.manufacturer_application_rules(
  product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,
  actions,priority,source_evidence_id,valid_from,active
)
SELECT
  mp.id,
  'pb7_acrylic_putty_small_holes_dents',
  'manufacturer',
  'pb7-2026-10-04',
  '{"scenario_key":"repair_small_holes_dents"}'::jsonb,
  'eligible_with_preparation',
  '{"message":"Acrylic Putty is documented for filling/coating plaster, concrete and wood. Use only after the scenario surface-stability and preparation checks."}'::jsonb,
  85,
  ie.id,
  '2026-10-04',
  true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id
 AND ie.evidence_fingerprint='679786029aced54bde9a78a7a16a7d3c36692e096b67e64299ff6be2cc1c7aaa'
 AND ie.is_current=true
WHERE mp.manufacturer_key='acrylic-putty'
ON CONFLICT (product_id,rule_key,source_layer,rule_revision) DO UPDATE
SET condition_expression=excluded.condition_expression,
    result_status=excluded.result_status,
    actions=excluded.actions,
    priority=excluded.priority,
    source_evidence_id=excluded.source_evidence_id,
    valid_from=excluded.valid_from,
    valid_to=NULL,
    active=true,
    updated_at=now();

-- 3. Visto: retire the four contaminated catalogue rows and replace them with the
--    actual Visto block from page 53 of the 2026 product guide.
UPDATE public.manufacturer_instruction_evidence
SET is_current=false,
    valid_to='2026-10-03'
WHERE product_id=(SELECT id FROM public.manufacturer_products WHERE manufacturer_key='visto' LIMIT 1)
  AND source_id=(SELECT id FROM public.manufacturer_technical_sources
                 WHERE manufacturer='Vitex'
                   AND source_url='https://www.vitex.gr/wp-content/uploads/2026/01/Vitex_Product_Catalogue_GR.pdf'
                   AND is_current=true
                 LIMIT 1)
  AND is_current=true;

WITH e(field_name,normalized_value,exact_excerpt,fingerprint_key) AS (
 VALUES
 ('product_description',
  '{"category":"filler","interior_exterior":"both","use":"filling and skim-coating interior and exterior surfaces"}'::jsonb,
  'Visto. Παρετίνη. Ιδανική για στοκάρισμα και σπατουλάρισμα εξωτερικών και εσωτερικών επιφανειών.',
  'pb7:visto:description'),
 ('package_sizes',
  '{"unit":"kg","sizes":[5,20],"colour":"White"}'::jsonb,
  'Λευκό 5kg 20kg',
  'pb7:visto:packages'),
 ('dilution',
  '{"material":"water","percent":{"min":30,"max":35}}'::jsonb,
  '30-35%',
  'pb7:visto:dilution'),
 ('coverage_m2_per_kg',
  '{"min":1,"max":1}'::jsonb,
  '1m²/Kg',
  'pb7:visto:coverage'),
 ('drying_time',
  '{"min_minutes":240,"max_minutes":300}'::jsonb,
  '4-5h',
  'pb7:visto:drying'),
 ('certification',
  '{"mark":"CE","standard":"EN 998-1"}'::jsonb,
  'CE EN 998-1',
  'pb7:visto:certification')
)
INSERT INTO public.manufacturer_instruction_evidence(
  product_id,source_id,source_layer,field_name,normalized_value,section_heading,exact_excerpt,
  confidence,evidence_fingerprint,valid_from,is_current
)
SELECT mp.id,
       ts.id,
       'manufacturer',e.field_name,e.normalized_value,'Vitex Product Catalogue GR 2026 · Visto',
       e.exact_excerpt,1,encode(digest(e.fingerprint_key,'sha256'),'hex'),'2026-10-04',true
FROM e
JOIN public.manufacturer_products mp ON mp.manufacturer_key='visto'
JOIN public.manufacturer_technical_sources ts
  ON ts.manufacturer='Vitex'
 AND ts.source_url='https://www.vitex.gr/wp-content/uploads/2026/01/Vitex_Product_Catalogue_GR.pdf'
 AND ts.is_current=true
ON CONFLICT (evidence_fingerprint) DO UPDATE
SET source_id=excluded.source_id,
    normalized_value=excluded.normalized_value,
    exact_excerpt=excluded.exact_excerpt,
    confidence=1,
    valid_from=excluded.valid_from,
    valid_to=NULL,
    is_current=true;

UPDATE public.manufacturer_products
SET verification_status='verified',
    product_system_status='current',
    certifications='[{"mark":"CE","standard":"EN 998-1"}]'::jsonb,
    last_verified_at=now(),
    updated_at=now()
WHERE id='c75e3a20-7f5c-4780-bbd2-db89609163f5'::uuid;

UPDATE public.manufacturer_application_profiles
SET verification_status='verified',
    profile_revision='Vitex Product Catalogue GR 2026 · corrected Run 7',
    suitable_for=ARRAY['filling interior surfaces','filling exterior surfaces','skim-coating interior surfaces','skim-coating exterior surfaces']::text[],
    interior_exterior='both',
    dilution_required=true,
    dilution_percent_min=30,
    dilution_percent_max=35,
    dilution_material='water',
    application_methods=ARRAY['spatula']::text[],
    consumption_value_min=1,
    consumption_value_max=1,
    consumption_unit='m²/kg',
    dry_to_touch_minutes_min=240,
    dry_to_touch_minutes_max=300,
    recoat_minutes_min=NULL,
    recoat_minutes_max=NULL,
    last_verified_at=now(),
    updated_at=now()
WHERE product_id='c75e3a20-7f5c-4780-bbd2-db89609163f5'::uuid
  AND source_layer='manufacturer'
  AND is_current=true;

UPDATE public.manufacturer_package_sizes
SET active=false
WHERE product_id=(SELECT id FROM public.manufacturer_products WHERE manufacturer_key='visto' LIMIT 1)
  AND active=true
  AND amount IN (0.4,0.8);

UPDATE public.manufacturer_package_sizes ps
SET amount=5,
    unit='kg',
    package_label='White 5 kg',
    source_evidence_id=(
      SELECT ie.id FROM public.manufacturer_instruction_evidence ie
      JOIN public.manufacturer_products mp ON mp.id=ie.product_id
      WHERE mp.manufacturer_key='visto'
        AND ie.evidence_fingerprint=encode(digest('pb7:visto:packages','sha256'),'hex')
        AND ie.is_current=true
      LIMIT 1
    ),
    active=true
WHERE ps.product_id=(SELECT id FROM public.manufacturer_products WHERE manufacturer_key='visto' LIMIT 1)
  AND ps.amount=5
  AND lower(ps.unit)='kg'
  AND ps.active=true;

INSERT INTO public.manufacturer_package_sizes(
  product_id,variant_id,amount,unit,package_label,source_evidence_id,active
)
SELECT mp.id,NULL,20,'kg','White 20 kg',ie.id,true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id
 AND ie.evidence_fingerprint=encode(digest('pb7:visto:packages','sha256'),'hex')
 AND ie.is_current=true
WHERE mp.manufacturer_key='visto'
  AND NOT EXISTS (
    SELECT 1 FROM public.manufacturer_package_sizes ps
    WHERE ps.product_id=mp.id
      AND ps.variant_id IS NULL
      AND ps.amount=20
      AND lower(ps.unit)='kg'
      AND ps.active=true
  );

INSERT INTO public.manufacturer_application_rules(
  product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,
  actions,priority,source_evidence_id,valid_from,active
)
SELECT
  mp.id,
  'pb7_visto_damaged_plaster',
  'manufacturer',
  'pb7-2026-10-04',
  '{"scenario_key":"repair_damaged_plaster"}'::jsonb,
  'eligible_with_preparation',
  '{"message":"Visto is documented for filling and skim-coating interior/exterior surfaces. It is not a structural repair product; unstable or detached plaster must first be handled by the scenario preparation rules."}'::jsonb,
  80,
  ie.id,
  '2026-10-04',
  true
FROM public.manufacturer_products mp
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=mp.id
 AND ie.evidence_fingerprint=encode(digest('pb7:visto:description','sha256'),'hex')
 AND ie.is_current=true
WHERE mp.manufacturer_key='visto'
ON CONFLICT (product_id,rule_key,source_layer,rule_revision) DO UPDATE
SET condition_expression=excluded.condition_expression,
    result_status=excluded.result_status,
    actions=excluded.actions,
    priority=excluded.priority,
    source_evidence_id=excluded.source_evidence_id,
    valid_from=excluded.valid_from,
    valid_to=NULL,
    active=true,
    updated_at=now();

-- 4. Velatura Eco Water already has a verified current application profile and
--    current 2026 catalogue packages; promote the manufacturer product gate.
UPDATE public.manufacturer_products
SET verification_status='verified',
    last_verified_at=now(),
    updated_at=now()
WHERE id='7d5572ec-ea1c-45d2-94ef-2fb2a9fe3d96'::uuid
  AND product_system_status='current';

-- 5. Heavy Metal Silicon Varnish: verify the technical profile, but do not turn
--    a clear protective varnish into a generic metal-paint recommendation.
UPDATE public.manufacturer_products
SET verification_status='verified',
    last_verified_at=now(),
    updated_at=now()
WHERE id='ec5393da-ad5e-414a-8852-7fa0221f4ea3'::uuid
  AND product_system_status='current';

UPDATE public.manufacturer_application_profiles
SET verification_status='verified',
    number_of_coats_min=2,
    number_of_coats_max=2,
    dilution_required=true,
    dilution_percent_min=0,
    dilution_percent_max=5,
    minimum_application_temperature_c=5,
    maximum_application_temperature_c=35,
    maximum_relative_humidity_percent=80,
    last_verified_at=now(),
    updated_at=now()
WHERE product_id='ec5393da-ad5e-414a-8852-7fa0221f4ea3'::uuid
  AND source_layer='manufacturer'
  AND is_current=true;

-- 6. Wooden Floor Varnish has current 2026 catalogue presence and complete TDS
--    evidence. Its mandatory primer remains portfolio-unresolved, so the varnish
--    is technically verified but intentionally not exposed through a Studio path.
UPDATE public.manufacturer_products
SET verification_status='verified',
    product_system_status='current',
    last_verified_at=now(),
    updated_at=now()
WHERE id='8f43f77b-c3cb-4be6-8fc7-dd6734a399be'::uuid;

UPDATE public.manufacturer_application_profiles
SET verification_status='verified',
    profile_revision='Official TDS + Catalogue 2026 · Run 7',
    primer_required=true,
    recommended_primers=ARRAY['Wooden Floor Primer']::text[],
    number_of_coats_min=2,
    number_of_coats_max=2,
    full_cure_minutes_min=20160,
    full_cure_minutes_max=20160,
    last_verified_at=now(),
    updated_at=now()
WHERE product_id='8f43f77b-c3cb-4be6-8fc7-dd6734a399be'::uuid
  AND source_layer='manufacturer'
  AND is_current=true;

INSERT INTO public.manufacturer_product_compatibility(
  source_product_id,target_product_id,relationship_type,relationship_strength,
  conditions,system_key,source_evidence_id,valid_from,is_current
)
SELECT
  source.id,
  target.id,
  'primer_before_topcoat',
  'required',
  'Official TDS requires two coats of Wooden Floor Primer before Wooden Floor Varnish.',
  'wooden-floor-system',
  ie.id,
  '2026-10-04',
  true
FROM public.manufacturer_products source
JOIN public.manufacturer_products target ON target.manufacturer_key='wooden-floor-primer'
JOIN public.manufacturer_instruction_evidence ie
  ON ie.product_id=source.id
 AND ie.evidence_fingerprint='ba31a5ba63a4a17ec04d43810882af59f27224eeafdb048cf73360a3dfa27496'
 AND ie.is_current=true
WHERE source.manufacturer_key='wooden-floor-varnish'
  AND NOT EXISTS (
    SELECT 1
    FROM public.manufacturer_product_compatibility c
    WHERE c.source_product_id=source.id
      AND c.target_product_id=target.id
      AND c.relationship_type='primer_before_topcoat'
      AND c.source_evidence_id=ie.id
      AND c.is_current=true
  );

-- 7. Run-7 completion view: distinguish portfolio uncertainty and missing identity
--    from actual technical-profile work.
CREATE OR REPLACE VIEW public.admin_vitex_studio_completion_audit
WITH (security_invoker = true)
AS
SELECT
  c.*,
  mp.product_category,
  mp.subcategory,
  CASE
    WHEN c.coverage_state IN ('unmatched','review_required')
      AND c.match_confidence <= 0.50
      THEN 'unmatched_insufficient_identity'
    WHEN c.coverage_state='technical_profile_unverified'
      AND mp.product_system_status='unknown'
      THEN 'portfolio_status_unresolved'
    WHEN c.coverage_state='verified_but_no_positive_pathway_rule'
      AND EXISTS (
        SELECT 1
        FROM public.manufacturer_product_compatibility rel
        JOIN public.manufacturer_products target ON target.id=rel.target_product_id
        WHERE rel.source_product_id=mp.id
          AND rel.relationship_strength='required'
          AND rel.is_current=true
          AND target.product_system_status<>'current'
      )
      THEN 'verified_system_dependency_unresolved'
    WHEN c.coverage_state='verified_but_no_positive_pathway_rule'
      AND (
        lower(COALESCE(mp.product_category,'')) ~ '(thinner|paint additive)'
        OR lower(COALESCE(mp.subcategory,'')) ~ '(thinner|hardener)'
      )
      THEN 'verified_auxiliary'
    WHEN c.coverage_state='verified_but_no_positive_pathway_rule'
      AND (
        lower(COALESCE(mp.product_category,'')) LIKE '%primer%'
        OR lower(COALESCE(mp.subcategory,'')) LIKE '%primer%'
      )
      THEN 'verified_auxiliary_unwired'
    WHEN c.coverage_state='verified_but_no_positive_pathway_rule'
      AND (
        lower(COALESCE(mp.product_category,'')) IN ('decorative paint','high-temperature metal paint','stone varnish')
        OR lower(COALESCE(mp.product_category,'')) LIKE '%varnish%'
        OR lower(COALESCE(mp.subcategory,'')) LIKE '%varnish%'
      )
      THEN 'verified_out_of_scope_current_scenarios'
    ELSE c.coverage_state
  END AS completion_state
FROM public.admin_vitex_studio_coverage c
LEFT JOIN public.manufacturer_products mp
  ON mp.id=c.manufacturer_product_id;

REVOKE ALL ON public.admin_vitex_studio_completion_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_vitex_studio_completion_audit TO service_role;

COMMENT ON VIEW public.admin_vitex_studio_completion_audit IS
'Server-only Paint & Build completion audit after Run 7. Separates true reachability, auxiliary products, portfolio uncertainty, unresolved system dependencies and insufficient identity.';

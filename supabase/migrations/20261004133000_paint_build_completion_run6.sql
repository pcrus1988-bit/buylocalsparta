-- Paint & Build Completion Run 6
-- 2026-10-04
-- Evidence-backed completion pass:
--   * promote explicit high-confidence VITEX commerce identities
--   * fully verify Vito Eco and Direct-3 in 1
--   * refresh Platinum PU source provenance
--   * add reviewed scenario pathways for Vito Eco, Vito Acrylic, Direct-3 in 1 and Platinum PU
--   * verify already-complete Grip 360 / PreColor technical products
--   * expose a completion audit that separates true gaps from auxiliary/out-of-scope products
--
-- Deliberately NOT promoted:
--   * Vito Eco 0.91 family-media-cluster commerce matches
--   * Wooden Floor Primer current status (2026 presence unresolved)
--   * generic "Αστάρι 3L λευκό" review-required match
--   * partially extracted products without enough current application evidence

UPDATE public.vitex_commerce_products
SET match_status='verified',
    match_evidence=COALESCE(match_evidence,'{}'::jsonb) || jsonb_build_object(
      'completion_run','2026-10-04',
      'identity_verification','explicit_match_promoted'
    ),
    updated_at=now()
WHERE active=true
  AND match_status='product_matched'
  AND match_confidence>=0.92
  AND match_method IN (
    'explicit_name_cluster',
    'explicit_function_alias',
    'explicit_family_alias',
    'explicit_name_colour',
    'explicit_alias'
  )
  AND manufacturer_product_id IN (
    'fb9a5f39-1996-4123-9e8d-bdae7a9fe722'::uuid, -- Acrylic Putty
    '051888a0-a3c4-44e0-930a-f1a7185427e9'::uuid, -- Direct-3 in 1
    'ec5393da-ad5e-414a-8852-7fa0221f4ea3'::uuid, -- Heavy Metal Silicon Varnish
    '17c74e5d-0ef0-4dc0-afb4-847e4b7ad173'::uuid, -- Platinum PU
    '7d5572ec-ea1c-45d2-94ef-2fb2a9fe3d96'::uuid, -- Velatura Eco Water
    '558237e5-23c2-4cb9-83e8-6ac35e518cf8'::uuid  -- Vito Acrylic
  );

UPDATE public.manufacturer_products
SET verification_status='verified',
    last_verified_at=now(),
    updated_at=now()
WHERE id IN (
  'b37df4c1-dfcd-4bc2-9008-720566113207'::uuid, -- Grip 360 Primer
  '7c318d49-4c4e-4eca-ab13-c7895e9e021f'::uuid, -- PreColor Primer
  '051888a0-a3c4-44e0-930a-f1a7185427e9'::uuid  -- Direct-3 in 1
)
AND product_system_status='current';

UPDATE public.manufacturer_application_profiles
SET verification_status='verified',
    last_verified_at=now(),
    updated_at=now()
WHERE product_id='051888a0-a3c4-44e0-930a-f1a7185427e9'::uuid
  AND source_layer='manufacturer'
  AND is_current=true;

-- Vito Eco: current official TDS + 2026 SDS.
INSERT INTO public.manufacturer_technical_sources(
  manufacturer,product_id,source_type,source_title,source_url,document_revision,publication_date,
  language,content_type,valid_from,is_current,metadata
)
SELECT 'Vitex','78548b0f-5dee-44fe-a82a-470acb0d8c41'::uuid,'tds',
       'Vito Eco Technical Data Sheet GR',
       'https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Vito_Eco_GR-1.pdf',
       '12.2020',NULL,'el','application/pdf','2026-10-04',true,
       jsonb_build_object(
         'acquisitionRun','paint-build-completion-2026-10-04',
         'officialManufacturerSource',true
       )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.manufacturer_technical_sources
  WHERE manufacturer='Vitex'
    AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Vito_Eco_GR-1.pdf'
    AND is_current=true
);

INSERT INTO public.manufacturer_technical_sources(
  manufacturer,product_id,source_type,source_title,source_url,document_revision,publication_date,
  language,content_type,valid_from,is_current,metadata
)
SELECT 'Vitex','78548b0f-5dee-44fe-a82a-470acb0d8c41'::uuid,'sds',
       'Vito Eco Safety Data Sheet GR Revision 10',
       'https://www.vitex.gr/wp-content/uploads/2020/08/VITO-ECO_SDS_GR-10.pdf',
       'Revision 10','2026-01-16','el','application/pdf','2026-01-16',true,
       jsonb_build_object(
         'acquisitionRun','paint-build-completion-2026-10-04',
         'officialManufacturerSource',true
       )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.manufacturer_technical_sources
  WHERE manufacturer='Vitex'
    AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/VITO-ECO_SDS_GR-10.pdf'
    AND is_current=true
);

WITH tds AS (
  SELECT id
  FROM public.manufacturer_technical_sources
  WHERE manufacturer='Vitex'
    AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Vito_Eco_GR-1.pdf'
    AND is_current=true
  LIMIT 1
),
e(field_name,normalized_value,exact_excerpt,fingerprint_key) AS (
 VALUES
 ('application_field','["concrete","plaster","brick","gypsum board","old painted surfaces"]'::jsonb,'Εσωτερικές νέες επιφάνειες ... και παλιές βαμμένες επιφάνειες','pb6:vito-eco:application-field'),
 ('surface_condition_required',to_jsonb('clean, dry and smooth; free from dust, oils and loose material'::text),'Οι επιφάνειες πρέπει να είναι καθαρές, στεγνές και λείες','pb6:vito-eco:surface-condition'),
 ('direct_recoat_existing_sound_paint','true'::jsonb,'το Vito Eco εφαρμόζεται κατευθείαν','pb6:vito-eco:direct-recoat'),
 ('repair_requirements','["Acrylic Putty","Visto"]'::jsonb,'χρησιμοποιείται Acrylic Putty ή Visto','pb6:vito-eco:repair'),
 ('primer_new_mineral','{"substrates":["plaster","concrete","brick","gypsum board"],"required_any_of":["Acrylan Unco Eco"]}'::jsonb,'ασταρώνονται με Acrylan Unco Eco','pb6:vito-eco:primer-new'),
 ('primer_stained_surface','{"required_any_of":["Blanco Eco"]}'::jsonb,'ασταρώνονται με Blanco Eco','pb6:vito-eco:primer-stains'),
 ('precolor_dark_shades','{"recommended_component":"PreColor Primer","condition":"dark_or_intense_final_shade"}'::jsonb,'συνίσταται ... PreColor Primer','pb6:vito-eco:precolor'),
 ('application_methods','["roller","brush","airless spray gun"]'::jsonb,'με ρολό, πινέλο ή πιστόλι airless','pb6:vito-eco:methods'),
 ('application_conditions','{"temperature_c":{"min":5,"max":35},"max_relative_humidity_percent":80}'::jsonb,'Εφαρμογή στους 5-35°C και <80% RH','pb6:vito-eco:conditions'),
 ('number_of_coats','{"min":2,"max":2}'::jsonb,'Για δύο στρώσεις 6-7 m2/L','pb6:vito-eco:coats'),
 ('coverage_m2_per_litre','{"one_coat":{"min":12,"max":14},"two_coats":{"min":6,"max":7}}'::jsonb,'Για μία στρώση 12-14 m2/L','pb6:vito-eco:coverage'),
 ('dry_to_touch_minutes','{"min":30,"max":60}'::jsonb,'Στην αφή 30-60 min','pb6:vito-eco:dry'),
 ('recoat_minutes','{"min":180,"max":240}'::jsonb,'Επαναβαφή 3-4 h','pb6:vito-eco:recoat'),
 ('dilution','{"material":"water","percent":{"min":0,"max":10}}'::jsonb,'Έως 10%','pb6:vito-eco:dilution'),
 ('tool_cleaning','["water","soapy water or detergent if needed"]'::jsonb,'Τα εργαλεία καθαρίζονται ... με νερό','pb6:vito-eco:tools'),
 ('voc_information','{"category_limit_g_l":30,"maximum_product_g_l":10,"operator":"lt"}'::jsonb,'Μέγιστη περιεκτικότητα προϊόντος <10 g/L ΠΟΕ','pb6:vito-eco:voc')
)
INSERT INTO public.manufacturer_instruction_evidence(
  product_id,source_id,source_layer,field_name,normalized_value,section_heading,exact_excerpt,
  confidence,evidence_fingerprint,valid_from,is_current
)
SELECT '78548b0f-5dee-44fe-a82a-470acb0d8c41'::uuid,
       tds.id,'manufacturer',e.field_name,e.normalized_value,'Vito Eco TDS',e.exact_excerpt,
       1,encode(digest(e.fingerprint_key,'sha256'),'hex'),'2026-10-04',true
FROM tds
CROSS JOIN e
ON CONFLICT (evidence_fingerprint) DO UPDATE
SET source_id=excluded.source_id,
    normalized_value=excluded.normalized_value,
    exact_excerpt=excluded.exact_excerpt,
    confidence=1,
    valid_from=excluded.valid_from,
    valid_to=NULL,
    is_current=true;

WITH sds AS (
  SELECT id
  FROM public.manufacturer_technical_sources
  WHERE manufacturer='Vitex'
    AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/VITO-ECO_SDS_GR-10.pdf'
    AND is_current=true
  LIMIT 1
),
e(field_name,normalized_value,exact_excerpt,fingerprint_key) AS (
 VALUES
 ('safety_classification','{"clp_hazardous":false,"euh208":true}'::jsonb,'Μπορεί να προκαλέσει αλλεργική αντίδραση.','pb6:vito-eco:safety'),
 ('ppe_requirements','["protective gloves"]'::jsonb,'Να φοράτε προστατευτικά γάντια.','pb6:vito-eco:ppe')
)
INSERT INTO public.manufacturer_instruction_evidence(
  product_id,source_id,source_layer,field_name,normalized_value,section_heading,exact_excerpt,
  confidence,evidence_fingerprint,valid_from,is_current
)
SELECT '78548b0f-5dee-44fe-a82a-470acb0d8c41'::uuid,
       sds.id,'manufacturer',e.field_name,e.normalized_value,'Vito Eco SDS',e.exact_excerpt,
       1,encode(digest(e.fingerprint_key,'sha256'),'hex'),'2026-01-16',true
FROM sds
CROSS JOIN e
ON CONFLICT (evidence_fingerprint) DO UPDATE
SET source_id=excluded.source_id,
    normalized_value=excluded.normalized_value,
    exact_excerpt=excluded.exact_excerpt,
    confidence=1,
    valid_from=excluded.valid_from,
    valid_to=NULL,
    is_current=true;

UPDATE public.manufacturer_products
SET tds_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Vito_Eco_GR-1.pdf',
    sds_url='https://www.vitex.gr/wp-content/uploads/2020/08/VITO-ECO_SDS_GR-10.pdf',
    substrate_types=ARRAY['concrete','plaster','brick','gypsum board','old painted surfaces']::text[],
    certifications='[{"claim":"EU Ecolabel ecological paint"}]'::jsonb,
    verification_status='verified',
    product_system_status='current',
    last_verified_at=now(),
    updated_at=now()
WHERE id='78548b0f-5dee-44fe-a82a-470acb0d8c41'::uuid;

UPDATE public.manufacturer_application_profiles
SET verification_status='verified',
    profile_revision='TDS 12.2020 + SDS Rev.10 + Catalogue 2026',
    primary_source_id=(
      SELECT id
      FROM public.manufacturer_technical_sources
      WHERE manufacturer='Vitex'
        AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Vito_Eco_GR-1.pdf'
        AND is_current=true
      LIMIT 1
    ),
    surface_types=ARRAY['interior wall','interior ceiling']::text[],
    substrates=ARRAY['concrete','plaster','brick','gypsum board','old painted surfaces']::text[],
    suitable_for=ARRAY['interior wall painting','commercial projects','frequent repainting']::text[],
    surface_condition_required='clean, dry and smooth; free from dust, oils and loose or flaking material',
    surface_preparation=ARRAY[
      'Sound existing paint may be recoated directly.',
      'Fill cracks or holes with Acrylic Putty or Visto.',
      'New plaster, concrete, brick and gypsum board require Acrylan Unco Eco.',
      'Stained surfaces require Blanco Eco before topcoat.',
      'For dark or intense final shades, PreColor Primer is recommended.'
    ]::text[],
    repair_requirements=ARRAY['Acrylic Putty','Visto']::text[],
    recommended_primers=ARRAY['Acrylan Unco Eco','Blanco Eco','PreColor Primer']::text[],
    dilution_required=true,
    dilution_percent_min=0,
    dilution_percent_max=10,
    dilution_material='water',
    application_methods=ARRAY['roller','brush','airless spray gun']::text[],
    number_of_coats_min=2,
    number_of_coats_max=2,
    coverage_m2_per_litre_min=12,
    coverage_m2_per_litre_max=14,
    coverage_conditions='Manufacturer TDS one-coat spreading rate 12-14 m²/L; two-coat spreading rate 6-7 m²/L.',
    dry_to_touch_minutes_min=30,
    dry_to_touch_minutes_max=60,
    recoat_minutes_min=180,
    recoat_minutes_max=240,
    minimum_application_temperature_c=5,
    maximum_application_temperature_c=35,
    maximum_relative_humidity_percent=80,
    tool_cleaning=ARRAY['water','soapy water or detergent if needed']::text[],
    storage_conditions='Keep containers closed in a shaded place; manufacturer storage range 5-38°C.',
    voc_information='Interior matt walls/ceilings: category limit 30 g/L; ready-to-use product <10 g/L.',
    ppe_requirements=ARRAY['protective gloves']::text[],
    safety_warnings=ARRAY['Current SDS includes EUH208: may produce an allergic reaction.']::text[],
    last_verified_at=now(),
    updated_at=now(),
    is_current=true
WHERE product_id='78548b0f-5dee-44fe-a82a-470acb0d8c41'::uuid
  AND source_layer='manufacturer'
  AND is_current=true;

-- Platinum PU: refresh the rule provenance to the manufacturer TDS version 09.2025.
INSERT INTO public.manufacturer_technical_sources(
  manufacturer,product_id,source_type,source_title,source_url,document_revision,
  language,content_type,valid_from,is_current,metadata
)
SELECT 'Vitex','17c74e5d-0ef0-4dc0-afb4-847e4b7ad173'::uuid,'tds',
       'Platinum PU Technical Data Sheet EN',
       'https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Platinum_EN-1.pdf',
       '09.2025','en','application/pdf','2026-10-04',true,
       jsonb_build_object(
         'acquisitionRun','paint-build-completion-2026-10-04',
         'officialManufacturerSource',true
       )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.manufacturer_technical_sources
  WHERE manufacturer='Vitex'
    AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Platinum_EN-1.pdf'
    AND is_current=true
);

WITH tds AS (
  SELECT id
  FROM public.manufacturer_technical_sources
  WHERE manufacturer='Vitex'
    AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Platinum_EN-1.pdf'
    AND is_current=true
  LIMIT 1
),
e(field_name,normalized_value,exact_excerpt,fingerprint_key) AS (
 VALUES
 ('primer_wood','{"required_any_of":["Velatura"]}'::jsonb,'wooden surfaces ... coated with Velatura','pb6:platinum:primer-wood'),
 ('primer_metal','{"required_any_of":["Anti-Rust Primer","Minio Primer","Metal Primer"]}'::jsonb,'Metal surfaces should be coated with an anticorrosive primer','pb6:platinum:primer-metal'),
 ('number_of_coats','{"min":2,"max":2}'::jsonb,'Two coats 8-9 m2/L','pb6:platinum:coats'),
 ('coverage_m2_per_litre','{"one_coat":{"min":16,"max":18},"two_coats":{"min":8,"max":9}}'::jsonb,'One coat 16-18 m2/L','pb6:platinum:coverage'),
 ('recoat_minutes','{"min":1200,"max":1440}'::jsonb,'Recoat 20-24 h','pb6:platinum:recoat')
)
INSERT INTO public.manufacturer_instruction_evidence(
  product_id,source_id,source_layer,field_name,normalized_value,section_heading,exact_excerpt,
  confidence,evidence_fingerprint,valid_from,is_current
)
SELECT '17c74e5d-0ef0-4dc0-afb4-847e4b7ad173'::uuid,
       tds.id,'manufacturer',e.field_name,e.normalized_value,'Platinum PU TDS 09.2025',e.exact_excerpt,
       1,encode(digest(e.fingerprint_key,'sha256'),'hex'),'2026-10-04',true
FROM tds
CROSS JOIN e
ON CONFLICT (evidence_fingerprint) DO UPDATE
SET source_id=excluded.source_id,
    normalized_value=excluded.normalized_value,
    exact_excerpt=excluded.exact_excerpt,
    confidence=1,
    valid_from=excluded.valid_from,
    valid_to=NULL,
    is_current=true;

UPDATE public.manufacturer_products
SET tds_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Platinum_EN-1.pdf',
    last_verified_at=now(),
    updated_at=now()
WHERE id='17c74e5d-0ef0-4dc0-afb4-847e4b7ad173'::uuid;

UPDATE public.manufacturer_application_profiles
SET profile_revision='TDS 09.2025',
    primary_source_id=(
      SELECT id
      FROM public.manufacturer_technical_sources
      WHERE manufacturer='Vitex'
        AND source_url='https://www.vitex.gr/wp-content/uploads/2020/08/TDS_Platinum_EN-1.pdf'
        AND is_current=true
      LIMIT 1
    ),
    number_of_coats_min=2,
    number_of_coats_max=2,
    last_verified_at=now(),
    updated_at=now()
WHERE product_id='17c74e5d-0ef0-4dc0-afb4-847e4b7ad173'::uuid
  AND source_layer='manufacturer'
  AND is_current=true;

-- Reviewed positive and component pathways.
INSERT INTO public.manufacturer_application_rules(
  product_id,rule_key,source_layer,rule_revision,condition_expression,result_status,
  actions,priority,source_evidence_id,valid_from,active
)
VALUES
('78548b0f-5dee-44fe-a82a-470acb0d8c41','pb6_vito_eco_repaint_sound','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_interior_repaint_sound"}','eligible',
 '{"message":"Vito Eco may be applied directly over sound existing paint after the documented surface checks."}',80,
 (SELECT id FROM public.manufacturer_instruction_evidence WHERE evidence_fingerprint=encode(digest('pb6:vito-eco:direct-recoat','sha256'),'hex')),'2026-10-04',true),
('78548b0f-5dee-44fe-a82a-470acb0d8c41','pb6_vito_eco_new_plaster','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_interior_new_plaster"}','requires_specific_primer',
 '{"primer_options":["Acrylan Unco Eco"]}',90,
 (SELECT id FROM public.manufacturer_instruction_evidence WHERE evidence_fingerprint=encode(digest('pb6:vito-eco:primer-new','sha256'),'hex')),'2026-10-04',true),
('78548b0f-5dee-44fe-a82a-470acb0d8c41','pb6_vito_eco_new_gypsum','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_interior_new_gypsum_board"}','requires_specific_primer',
 '{"primer_options":["Acrylan Unco Eco"]}',90,
 (SELECT id FROM public.manufacturer_instruction_evidence WHERE evidence_fingerprint=encode(digest('pb6:vito-eco:primer-new','sha256'),'hex')),'2026-10-04',true),
('78548b0f-5dee-44fe-a82a-470acb0d8c41','pb6_vito_eco_stained','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_interior_stained"}','requires_specific_primer',
 '{"primer_options":["Blanco Eco"]}',90,
 (SELECT id FROM public.manufacturer_instruction_evidence WHERE evidence_fingerprint=encode(digest('pb6:vito-eco:primer-stains','sha256'),'hex')),'2026-10-04',true),

('558237e5-23c2-4cb9-83e8-6ac35e518cf8','pb6_vito_acrylic_exterior_repaint','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_exterior_repaint_sound"}','eligible_with_preparation',
 '{"message":"Vito Acrylic is documented for old exterior mineral surfaces; primer is selected case by case after substrate inspection."}',80,
 'ffee0092-db94-4280-82be-e3454864e537','2026-10-04',true),
('558237e5-23c2-4cb9-83e8-6ac35e518cf8','pb6_vito_acrylic_new_plaster','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_exterior_new_plaster"}','requires_specific_primer',
 '{"primer_options":["Acrylan Unco Eco","Durovit"]}',90,
 '84872767-e82b-47d3-a4e7-7a9eebc74693','2026-10-04',true),

('051888a0-a3c4-44e0-930a-f1a7185427e9','pb6_direct_bare_ferrous','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_metal_bare_ferrous","metal_type":"ferrous_steel"}','eligible',
 '{"message":"Direct-3 in 1 is documented for new ferrous metal without an anticorrosive primer after preparation."}',90,
 'fffde974-dea7-465a-be62-eab8c0869c7e','2026-10-04',true),
('051888a0-a3c4-44e0-930a-f1a7185427e9','pb6_direct_rusty_ferrous','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_metal_rusty","metal_type":"ferrous_steel"}','eligible_with_preparation',
 '{"message":"Direct-3 in 1 is documented for rusted ferrous metal without primer; loose rust and contamination still require the documented preparation."}',95,
 'b161282f-a892-49fb-b8aa-6a8ff79a411b','2026-10-04',true),
('051888a0-a3c4-44e0-930a-f1a7185427e9','pb6_direct_existing_ferrous','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_metal_existing_sound_ferrous","metal_type":"ferrous_steel"}','eligible_with_preparation',
 '{"message":"Direct-3 in 1 is documented for old/painted metal after cleaning, sanding and compatibility checks."}',85,
 'fffde974-dea7-465a-be62-eab8c0869c7e','2026-10-04',true),

('17c74e5d-0ef0-4dc0-afb4-847e4b7ad173','pb6_platinum_wood_bare','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_wood_bare"}','requires_specific_primer',
 '{"primer_options":["Velatura"]}',90,
 (SELECT id FROM public.manufacturer_instruction_evidence WHERE evidence_fingerprint=encode(digest('pb6:platinum:primer-wood','sha256'),'hex')),'2026-10-04',true),
('17c74e5d-0ef0-4dc0-afb4-847e4b7ad173','pb6_platinum_metal_bare','manufacturer','pb6-2026-10-04',
 '{"scenario_key":"paint_metal_bare_ferrous","metal_type":"ferrous_steel"}','requires_specific_primer',
 '{"primer_options":["Anti-Rust Primer","Minio Primer","Metal Primer"]}',90,
 (SELECT id FROM public.manufacturer_instruction_evidence WHERE evidence_fingerprint=encode(digest('pb6:platinum:primer-metal','sha256'),'hex')),'2026-10-04',true)
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

-- Completion audit: no verified product should remain in an ambiguous "unknown" bucket
-- merely because it is auxiliary or outside the Studio's current scenario ontology.
CREATE OR REPLACE VIEW public.admin_vitex_studio_completion_audit
WITH (security_invoker = true)
AS
SELECT
  c.*,
  mp.product_category,
  mp.subcategory,
  CASE
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
      AND lower(COALESCE(mp.product_category,'')) IN (
        'decorative paint',
        'high-temperature metal paint',
        'stone varnish'
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
'Server-only Paint & Build completion audit. Separates true identity/technical/pathway gaps from verified auxiliary products and verified products outside the current scenario ontology.';

-- Final independent corroboration for context-dependent Layer A workflow steps.
-- Adds current standards/professional guidance for protective steel coating systems
-- and exterior wood coating-system selection. Manufacturer-specific numeric/application
-- values remain exclusively in Layer B.
BEGIN;

INSERT INTO public.general_build_sources
(source_key,organization,source_type,title,url,jurisdiction,standard_identifier,
 publication_date,revision,retrieved_at,relevant_section_page,source_status,notes,active)
VALUES
(
  'iso_12944_5_2019',
  'ISO',
  'standard',
  'Paints and varnishes — Corrosion protection of steel structures by protective paint systems — Part 5: Protective paint systems',
  'https://www.iso.org/standard/77795.html',
  'International',
  'ISO 12944-5:2019',
  '2019-09-01',
  'Edition 4; current published edition reviewed 2026-09-22',
  now(),
  'Abstract / protective paint systems and system selection',
  'current',
  'Used only for general protective-paint-system selection and structure. Exact product identity, film thickness, coats, recoat/cure windows and environmental limits remain selected-system/manufacturer data.',
  true
),
(
  'steelconstruction_paint_coatings_2026',
  'BCSA / Steel for Life / SCI',
  'professional_guidance',
  'Paint coatings',
  'https://steelconstruction.info/topics/corrosion-protection/paint-coatings',
  'Professional structural-steel guidance; not a Greek statutory specification',
  NULL,
  NULL,
  'Current web guidance reviewed 2026-09-22',
  now(),
  'Protective paint system; primers; intermediate coats; finish coats; manufacturer recommendations',
  'current',
  'Used to corroborate the general primer/intermediate/finish sequence and the principle that paints within a protective system should be compatible and used according to manufacturer recommendations. Example coating types and numeric film thicknesses are not transferred into Layer A.',
  true
),
(
  'bsi_en_927_1_2013',
  'British Standards Institution / CEN',
  'standard',
  'BS EN 927-1:2013 — Paints and varnishes. Coating materials and coating systems for exterior wood — Classification and selection',
  'https://knowledge.bsigroup.com/products/paints-and-varnishes-coating-materials-and-coating-systems-for-exterior-wood-classification-and-selection',
  'European standard publication record; local/national requirements remain applicable',
  'EN 927-1:2013',
  '2013-06-30',
  'Current edition reviewed 2026-09-22',
  now(),
  'Scope / classification and selection of exterior wood coating systems',
  'current',
  'Used only to support system selection by end use/exposure and the existence of multi-coat components such as primer, undercoat and top coat. Exact product identities and application values remain manufacturer-specific.',
  true
)
ON CONFLICT (source_key) DO UPDATE SET
  organization=EXCLUDED.organization,
  source_type=EXCLUDED.source_type,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  jurisdiction=EXCLUDED.jurisdiction,
  standard_identifier=EXCLUDED.standard_identifier,
  publication_date=EXCLUDED.publication_date,
  revision=EXCLUDED.revision,
  retrieved_at=EXCLUDED.retrieved_at,
  relevant_section_page=EXCLUDED.relevant_section_page,
  source_status=EXCLUDED.source_status,
  notes=EXCLUDED.notes,
  active=true,
  updated_at=now();

-- Rusty ferrous metal: protective-system primer and intermediate/finish layers.
WITH targets AS (
  SELECT st.id,st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_metal_rusty'
    AND st.active=true
    AND st.step_type IN ('primer','intermediate_finish')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE t.step_type
    WHEN 'primer'
      THEN 'ISO 12944-5 describes protective paint systems for corrosion protection of steel and provides guidance for selecting systems for the relevant environment and prepared substrate, supporting primer selection as part of the defined protective system.'
    ELSE 'ISO 12944-5 describes protective paint systems for steel and their selection, supporting intermediate/finish layers as components of the selected corrosion-protection system rather than generic standalone coatings.'
  END,
  'Abstract / protective paint systems and system selection',
  'standard_based',
  CASE t.step_type
    WHEN 'primer'
      THEN 'Scenario: paint_metal_rusty. Supports primer as a selected protective-system component; exact primer chemistry, thickness and application remain Layer B/project specification.'
    ELSE 'Scenario: paint_metal_rusty. Supports selected-system intermediate/finish sequencing; exact products, number of layers, thicknesses and application values remain Layer B/project specification.'
  END
FROM targets t
JOIN public.general_build_sources s ON s.source_key='iso_12944_5_2019' AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Additional professional corroboration for steel system sequence.
WITH targets AS (
  SELECT st.id,st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_metal_rusty'
    AND st.active=true
    AND st.step_type IN ('primer','intermediate_finish','cure')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE
    WHEN t.step_type='primer'
      THEN 'Professional steel-coating guidance describes protective paint systems as sequenced layers beginning with a primer on the prepared steel surface.'
    WHEN t.step_type='intermediate_finish'
      THEN 'Professional steel-coating guidance describes protective systems as compatible primer, intermediate/build and finish coats applied in a defined sequence.'
    ELSE 'Professional steel-coating guidance states that paints within a protective system should be compatible and used in accordance with the manufacturer recommendations, supporting product-specific recoat/cure/application limits rather than universal Layer A values.'
  END,
  CASE
    WHEN t.step_type='primer' THEN 'Protective paint system / Primers'
    WHEN t.step_type='intermediate_finish' THEN 'Protective paint system / Intermediate coats / Finish coat'
    ELSE 'The paint system / manufacturer recommendations'
  END,
  'strong_consensus',
  CASE
    WHEN t.step_type='primer'
      THEN 'Scenario: paint_metal_rusty. General system-sequence corroboration only; exact primer remains Layer B.'
    WHEN t.step_type='intermediate_finish'
      THEN 'Scenario: paint_metal_rusty. General compatible layer-sequence corroboration only; exact layers and values remain Layer B.'
    ELSE 'Scenario: paint_metal_rusty. Supports obeying selected-system manufacturer recoat/cure/application requirements; no numeric time or environmental limit is imported into Layer A.'
  END
FROM targets t
JOIN public.general_build_sources s ON s.source_key='steelconstruction_paint_coatings_2026' AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Bare exterior wood: system pretreatment and finish belong to selected wood coating system.
WITH targets AS (
  SELECT st.id,st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE p.scenario_key='paint_wood_bare'
    AND st.active=true
    AND st.step_type IN ('system_pretreatment','finish')
)
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_step',
  t.id,
  s.id,
  CASE
    WHEN t.step_type='system_pretreatment'
      THEN 'EN 927-1 classifies exterior wood coating systems by end use, appearance and exposure and defines components of multi-coat systems such as primer, undercoat and top coat; pretreatment/primer need therefore belongs to the selected wood coating system and use case.'
    ELSE 'EN 927-1 provides a classification and selection framework for exterior wood coating materials and systems according to end use and exposure, supporting finish selection as a system decision rather than a universal finish prescription.'
  END,
  'Scope / classification and selection of exterior wood coating systems',
  'standard_based',
  CASE
    WHEN t.step_type='system_pretreatment'
      THEN 'Scenario: paint_wood_bare. Supports conditional system-component selection; exact primer, sealer or preservative product and application values remain Layer B.'
    ELSE 'Scenario: paint_wood_bare. Supports selecting the finish within the appropriate exterior wood coating system; exact product, coats and application values remain Layer B.'
  END
FROM targets t
JOIN public.general_build_sources s ON s.source_key='bsi_en_927_1_2013' AND s.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM (
    SELECT e.entity_id
    FROM public.general_build_rule_evidence e
    JOIN public.build_solution_steps st ON st.id=e.entity_id
    JOIN public.build_solution_profiles p ON p.id=st.scenario_id
    WHERE e.entity_type='solution_step'
      AND e.active=true
      AND st.active=true
      AND p.source_layer='GENERAL_GUIDANCE'
    GROUP BY e.entity_id
    HAVING count(DISTINCT e.source_id)=1
       AND bool_or(e.evidence_strength='context_dependent')
  ) x;

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Context-dependent Layer A workflow steps still single-sourced: %', remaining;
  END IF;
END
$$;

COMMIT;

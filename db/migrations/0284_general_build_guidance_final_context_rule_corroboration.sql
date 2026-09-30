-- Corroborate the final three Layer A solution rules that still relied on
-- one context-dependent source. This migration deliberately preserves the
-- rule boundaries: exact product/primer/environmental limits stay in Layer B.
BEGIN;

INSERT INTO public.general_build_sources
(source_key,organization,source_type,title,url,jurisdiction,standard_identifier,
 publication_date,revision,retrieved_at,relevant_section_page,source_status,notes,active)
VALUES
(
  'sherwin_exterior_application_faq_2026',
  'Sherwin-Williams',
  'manufacturer_general_practice',
  'Exterior: Product Application Frequently Asked Questions',
  'https://www.sherwin-williams.com/home-builders/color/resources/faqs/exterior-product-application-faqs',
  'General professional coating practice; manufacturer examples are not imported as universal Greek limits',
  NULL,
  NULL,
  'Current web guidance reviewed 2026-09-22',
  now(),
  'Exterior application temperature / weather / label-direction FAQs',
  'current',
  'Used only to support that exterior coating environmental limits can differ by product and that product label/data directions govern exact application temperatures and conditions. No numeric Sherwin-Williams threshold is transferred into KONTA MOU Layer A.',
  true
),
(
  'sherwin_new_plaster_prep_2026',
  'Sherwin-Williams',
  'manufacturer_general_practice',
  'How to Paint Prep — New Plaster Walls',
  'https://www.sherwin-williams.com/en-us/project-center/paint/how-to-paint-prep',
  'General professional coating practice; manufacturer examples are not imported as universal Greek limits',
  NULL,
  NULL,
  'Current web guidance reviewed 2026-09-22',
  now(),
  'New plaster walls / primer and surface-preparation guidance',
  'current',
  'Used only to support that new plaster needs condition-specific preparation and priming and that primer selection belongs to the selected coating system. Numeric cure times, dilution and product identities shown by the source are not transferred into KONTA MOU Layer A.',
  true
)
ON CONFLICT (source_key) DO UPDATE SET
  organization=EXCLUDED.organization,
  source_type=EXCLUDED.source_type,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  jurisdiction=EXCLUDED.jurisdiction,
  revision=EXCLUDED.revision,
  retrieved_at=EXCLUDED.retrieved_at,
  relevant_section_page=EXCLUDED.relevant_section_page,
  source_status=EXCLUDED.source_status,
  notes=EXCLUDED.notes,
  active=true,
  updated_at=now();

-- Exterior chalking: corroborate conditional (not automatic) primer selection
-- using the independent BS 6150 preparation/system-selection framework.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_rule',
  r.id,
  s.id,
  'BS 6150 places substrate assessment and preparation before coating-system selection; this supports deciding whether a primer is needed from the prepared substrate/system rather than treating primer as automatic for every chalking case.',
  'Standard scope / preparation framework',
  'standard_based',
  'Scenario: paint_exterior_chalking. Supports conditional primer need only; exact primer identity, preparation and application values remain Layer B.'
FROM public.build_solution_rules r
JOIN public.build_solution_profiles p ON p.id=r.scenario_id
JOIN public.general_build_sources s ON s.source_key='bs_6150_2019' AND s.active=true
WHERE p.scenario_key='paint_exterior_chalking'
  AND r.rule_key='stabilising_primer_not_automatic'
  AND r.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- Exterior repaint weather limits: current manufacturer guidance explicitly shows
-- that product lines can have different application-temperature capability and directs
-- users to label/manufacturer directions for the exact conditions.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_rule',
  r.id,
  s.id,
  'Current exterior application guidance shows that allowable application conditions differ between coating products and directs users to follow the product label/manufacturer directions for the exact environmental limits.',
  'Exterior application temperature / weather FAQs',
  'strong_consensus',
  'Scenario: paint_exterior_repaint_sound. Supports only that exact temperature, humidity, dew/rain and curing-condition limits are selected-product/manufacturer data. No source-specific numeric threshold is imported into Layer A.'
FROM public.build_solution_rules r
JOIN public.build_solution_profiles p ON p.id=r.scenario_id
JOIN public.general_build_sources s ON s.source_key='sherwin_exterior_application_faq_2026' AND s.active=true
WHERE p.scenario_key='paint_exterior_repaint_sound'
  AND r.rule_key='weather_limits_are_manufacturer_specific'
  AND r.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

-- New interior plaster: corroborate that plaster preparation/primer treatment depends
-- on the actual plaster condition and selected coating system; exact primer stays Layer B.
INSERT INTO public.general_build_rule_evidence
(entity_type,entity_id,source_id,supporting_passage,relevant_section_page,evidence_strength,applicability)
SELECT
  'solution_rule',
  r.id,
  s.id,
  'Current new-plaster preparation guidance distinguishes plaster condition before priming and then directs application through a primer/coating system, supporting condition- and system-specific primer selection rather than one universal primer.',
  'New Plaster Walls',
  'common_professional_practice',
  'Scenario: paint_interior_new_plaster. Supports the Layer A rule that an exact primer must come from the selected verified system. Numeric cure times, dilution and named products remain excluded from Layer A.'
FROM public.build_solution_rules r
JOIN public.build_solution_profiles p ON p.id=r.scenario_id
JOIN public.general_build_sources s ON s.source_key='sherwin_new_plaster_prep_2026' AND s.active=true
WHERE p.scenario_key='paint_interior_new_plaster'
  AND r.rule_key='new_plaster_exact_primer_is_manufacturer_specific'
  AND r.active=true
ON CONFLICT (entity_type,entity_id,source_id) DO NOTHING;

DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM (
    SELECT e.entity_id
    FROM public.general_build_rule_evidence e
    JOIN public.build_solution_rules r ON r.id=e.entity_id
    JOIN public.build_solution_profiles p ON p.id=r.scenario_id
    WHERE e.entity_type='solution_rule'
      AND e.active=true
      AND r.active=true
      AND p.source_layer='GENERAL_GUIDANCE'
    GROUP BY e.entity_id
    HAVING count(DISTINCT e.source_id)=1
       AND bool_or(e.evidence_strength='context_dependent')
  ) x;

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Context-dependent Layer A solution rules still single-sourced: %', remaining;
  END IF;
END
$$;

COMMIT;

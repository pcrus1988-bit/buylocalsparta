-- Final claim-level provenance for scenario-specific Layer C stop conditions.
-- External sources support only the technical premise. The conservative blocking
-- decision remains KONTA MOY Layer C governance. No manufacturer/product values
-- or universal numeric thresholds are introduced.
BEGIN;

INSERT INTO public.general_build_sources
(source_key, organization, source_type, title, url, jurisdiction, standard_identifier,
 publication_date, revision, retrieved_at, relevant_section_page, source_status, notes, active)
VALUES
(
  'gypsum_association_water_damage_2025',
  'Gypsum Association',
  'professional_guidance',
  'Storms and Flooding: Gypsum Association Technical Resources — GA-231-2025',
  'https://gypsum.org/hurricanes-and-flooding-gypsum-association-technical-resources/',
  'United States / general gypsum technical reference; not Greek law',
  'GA-231-2025',
  NULL,
  'GA-231-2025 / current Gypsum Association resource',
  now(),
  'Water-damage assessment; moisture-source control; evaluation of exposed gypsum board',
  'current',
  'Used only for general water-damage assessment and source-control principles. No universal gypsum moisture percentage or product-specific finishing value is imported.',
  true
),
(
  'usda_fpl_biodeterioration_wood_2021',
  'USDA Forest Service, Forest Products Laboratory',
  'government_guidance',
  'Wood Handbook — Chapter 14: Biodeterioration of wood',
  'https://research.fs.usda.gov/treesearch/62262',
  'United States / general wood-science reference; not Greek law',
  'FPL-GTR-282 Chapter 14',
  '2021-01-01',
  '2021',
  now(),
  'Chapter 14 abstract and wood-decay discussion',
  'current',
  'Used only for the general principle that decay organisms degrade wood under suitable moisture/environmental conditions. Exact repair/replacement decisions remain project-specific.',
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

WITH mapped(stop_key, scenario_key, source_key, passage, section_page, strength, applicability) AS (
  VALUES
    (
      'gypsum_board_active_moisture_damage',
      'paint_interior_new_gypsum_board',
      'gypsum_association_water_damage_2025',
      'Gypsum Association water-damage guidance requires the water source to be identified and eliminated and water-exposed gypsum board to be evaluated for drying, physical damage and continued suitability before it is retained.',
      'GA-231-2025 water-damage assessment / Gypsum Association flooding resources',
      'strong_consensus',
      'Supports the technical premise that actively wet or water-damaged gypsum board must be assessed before decorative finishing. No universal moisture threshold is inferred; the product-selection/application block remains KONTA MOY Layer C governance.'
    ),
    (
      'metal_type_unknown',
      'paint_metal_bare_ferrous',
      'sherwin_surface_prep',
      'General preparation guidance treats aluminum/galvanized steel separately from steel and gives different preparation steps for those substrate groups.',
      'Aluminum & Galvanized Steel; Steel',
      'common_professional_practice',
      'Supports identifying the metal substrate before applying a ferrous-steel-specific workflow. It does not prescribe a KONTA MOY product or primer; the blocking decision remains Layer C governance.'
    ),
    (
      'severe_section_loss',
      'paint_metal_existing_sound_ferrous',
      'steelconstruction_corrosion',
      'Professional structural-steel guidance explains that corrosion consumes metal, can cause general metal loss, and can also progress locally as pitting into the steel.',
      'Corrosion process; localised corrosion; pitting corrosion',
      'strong_consensus',
      'Supports distinguishing substantial metal loss from a coating-only surface-rust problem. The threshold for “severe” and the requirement for technical assessment remain conservative KONTA MOY Layer C governance, not a universal numeric rule.'
    ),
    (
      'significant_wood_decay',
      'paint_wood_existing_sound',
      'usda_fpl_biodeterioration_wood_2021',
      'USDA Forest Products Laboratory guidance identifies decay fungi among organisms that degrade wood when suitable environmental conditions permit their growth.',
      'Chapter 14 abstract and decay discussion',
      'strong_consensus',
      'Supports treating significant decay/softness as substrate degradation rather than a routine repaint condition. Exact repair or replacement decisions remain project-specific; the stop is KONTA MOY Layer C governance.'
    ),
    (
      'significant_wood_decay',
      'paint_wood_weathered',
      'usda_fpl_biodeterioration_wood_2021',
      'USDA Forest Products Laboratory guidance identifies decay fungi among organisms that degrade wood when suitable environmental conditions permit their growth.',
      'Chapter 14 abstract and decay discussion',
      'strong_consensus',
      'Supports separating biological decay from ordinary surface weathering before choosing a finishing workflow. Exact repair or replacement decisions remain project-specific; the stop is KONTA MOY Layer C governance.'
    ),
    (
      'moving_detail_not_designed',
      'waterproof_details_parapets_joints_penetrations',
      'lrwa_design_guide_specifiers_2020',
      'LRWA movement-joint guidance states that the potential movement of an existing joint should be considered in the joint/kerb/flashing detail and that typical details are indicative, with system-specific guidance supplied by the waterproofing-system manufacturer.',
      'Design Guide §3.18 common details; Typical Movement Joint with Raised Kerbs',
      'strong_consensus',
      'Supports designing/confirming a movement-capable detail rather than treating an unknown moving joint as an ordinary crack. Exact detail and materials remain system/manufacturer-specific; blocking remains KONTA MOY Layer C governance.'
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  sc.id,
  src.id,
  m.passage,
  m.section_page,
  m.strength,
  m.applicability
FROM mapped m
JOIN public.build_solution_profiles p
  ON p.scenario_key=m.scenario_key
JOIN public.build_stop_conditions sc
  ON sc.scenario_id=p.id
 AND sc.stop_key=m.stop_key
 AND sc.active=true
JOIN public.general_build_sources src
  ON src.source_key=m.source_key
 AND src.active=true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.general_build_rule_evidence existing
  WHERE existing.entity_type='stop_condition'
    AND existing.entity_id=sc.id
    AND existing.source_id=src.id
    AND existing.active=true
);

COMMIT;

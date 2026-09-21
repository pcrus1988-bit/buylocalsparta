-- KONTA MOY — General Paint & Build guidance evidence hardening.
-- Keeps Layer A (GENERAL_GUIDANCE), Layer B (manufacturer) and Layer C
-- (KONTA_MOU_RULE) provenance strictly separated, and completes the
-- first-batch evidence review for crack, plaster and balcony scenarios.

BEGIN;

INSERT INTO public.general_build_sources
(source_key, organization, source_type, title, url, jurisdiction, standard_identifier,
 publication_date, revision, retrieved_at, relevant_section_page, source_status, notes, active)
VALUES
(
 'bsi_en_13914_1_2016',
 'British Standards Institution / CEN',
 'standard',
 'EN 13914-1:2016 — Design, preparation and application of external rendering and internal plastering — External rendering',
 'https://knowledge.bsigroup.com/products/design-preparation-and-application-of-external-rendering-and-internal-plastering-external-rendering',
 'EU standard / UK standards-body public summary; general technical reference, not Greek law',
 'EN 13914-1:2016',
 DATE '2016-03-31',
 '2016',
 now(),
 'Scope and overview: new/old backgrounds; preparation/application; maintenance and non-structural repair of existing render',
 'current',
 'Public standards-body summary used for scope and general non-structural render-repair principles. A 2026 revision is under development; this is the currently published release.',
 true
),
(
 'bsi_en_13914_2_2016',
 'British Standards Institution / CEN',
 'standard',
 'EN 13914-2:2016 — Design, preparation and application of external rendering and internal plastering — Internal plastering',
 'https://landingpage.bsigroup.com/LandingPage/Undated?UPI=000000000030139918',
 'EU standard / UK standards-body public summary; general technical reference, not Greek law',
 'EN 13914-2:2016',
 DATE '2016-07-31',
 '2016',
 now(),
 'Scope: design considerations and essential principles for internal plastering systems and their application',
 'current',
 'Public standards-body record identifies the 2016 edition as the current published release while a replacement revision is under development.',
 true
),
(
 'elot_en_16566_2014',
 'Hellenic Organization for Standardization (ELOT)',
 'standard',
 'ΕΛΟΤ EN 16566 — Paints and varnishes — Fillers for internal and/or external works',
 'https://eshop.elot.gr/product/93085',
 'Greece / EU',
 'EN 16566:2014',
 DATE '2015-02-26',
 'ELOT adoption of EN 16566:2014',
 now(),
 'Abstract / scope and limits of preparatory-decorative fillers',
 'current',
 'Used to define the role and limits of filler products and the possibility of flexible reinforcement along joints; not structural-repair guidance.',
 true
),
(
 'elot_en_14891_2017',
 'Hellenic Organization for Standardization (ELOT)',
 'standard',
 'ΕΛΟΤ EN 14891 Ε3 — Liquid applied water impermeable products beneath ceramic tiling',
 'https://eshop.elot.gr/product/96205',
 'Greece / EU',
 'EN 14891:2017',
 DATE '2017-03-28',
 'E3 / EN 14891:2017',
 now(),
 'Abstract / scope, performance requirements and explicit exclusion of installation-design recommendations',
 'current',
 'Used only for the under-tile liquid-applied waterproofing product class and performance context. It explicitly does not provide tile/waterproofing installation design instructions.',
 true
),
(
 'lrwa_guidance_note_4_refurbishment',
 'Liquid Roofing and Waterproofing Association (LRWA)',
 'professional_guidance',
 'Guidance Note No. 4 — Roof, Balcony and Walkway Refurbishment Using Liquid Applied Waterproofing Systems',
 'https://www.lrwa.org.uk/wp-content/uploads/2024/02/Guidance-Note-No-4.pdf',
 'United Kingdom / general technical reference',
 NULL,
 DATE '2010-01-01',
 'Issued 2010',
 now(),
 'Sections 2–4: inspection, suitability and preparation for roofs/balconies/walkways',
 'current',
 'Trade-association technical guidance. UK regulatory references in the document are not treated as Greek law; only general inspection, preparation, drainage and compatibility principles are used.',
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

-- Layer C governance may explain stop conditions, but must not be used as
-- evidence for Layer A technical records.
UPDATE public.general_build_rule_evidence e
SET active=false
FROM public.general_build_sources s
WHERE e.source_id=s.id
  AND e.active
  AND s.source_type='internal_governance'
  AND e.entity_type <> 'stop_condition';

CREATE OR REPLACE FUNCTION public.enforce_general_build_evidence_layer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_source_type text;
BEGIN
  SELECT source_type INTO v_source_type
  FROM public.general_build_sources
  WHERE id=NEW.source_id;

  IF v_source_type='internal_governance'
     AND NEW.entity_type <> 'stop_condition'
     AND NEW.active THEN
    RAISE EXCEPTION 'internal_governance evidence may only support KONTA_MOU_RULE stop conditions';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS general_build_rule_evidence_layer_guard
ON public.general_build_rule_evidence;

CREATE TRIGGER general_build_rule_evidence_layer_guard
BEFORE INSERT OR UPDATE OF entity_type, source_id, active
ON public.general_build_rule_evidence
FOR EACH ROW EXECUTE FUNCTION public.enforce_general_build_evidence_layer();

-- Crack scenarios: strengthen the non-structural repair-material branch with
-- the ELOT adoption of EN 16566. Diagnostic stability/movement screening
-- remains supported by the independent RICS / government evidence seeded in 0265.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'profile', p.id, s.id,
 'EN 16566 defines preparatory/decorative fillers for new or existing internal/external backgrounds and distinguishes them from structural or thick truing work; flexible reinforcement may be incorporated at joints to limit visible cracking.',
 'Abstract / scope',
 'standard_based',
 'Applies only to filler/preparatory-coating aspects of non-structural crack treatment; crack cause and structural stability remain diagnostic questions.',
 true
FROM public.build_solution_profiles p
JOIN public.general_build_sources s ON s.source_key='elot_en_16566_2014'
WHERE p.scenario_key IN ('paint_exterior_hairline_cracks','repair_hairline_wall_crack')
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'project_kit_requirement', k.id, s.id,
 'The standard treats fillers as preparatory/decorative materials for appropriate backgrounds; exact filler, reinforcement and layer limits remain product/system-specific.',
 'Abstract / scope',
 'standard_based',
 'Supports the crack-repair-material category only, not a claim that any specific filler is suitable.',
 true
FROM public.build_project_kit_requirements k
JOIN public.build_solution_profiles p ON p.id=k.scenario_id
JOIN public.general_build_sources s ON s.source_key='elot_en_16566_2014'
WHERE p.scenario_key IN ('paint_exterior_hairline_cracks','repair_hairline_wall_crack')
  AND k.requirement_type='crack_repair_material'
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'solution_step', st.id, s.id,
 'Where a non-structural crack pathway uses a filler, EN 16566 places that material in a preparatory/decorative role and allows flexible reinforcement in relevant joint situations; exact use remains manufacturer-defined.',
 'Abstract / scope',
 'standard_based',
 'Conditional on the crack having first passed movement/structural screening and on the chosen product being within this product class.',
 true
FROM public.build_solution_steps st
JOIN public.build_solution_profiles p ON p.id=st.scenario_id
JOIN public.general_build_sources s ON s.source_key='elot_en_16566_2014'
WHERE (p.scenario_key='paint_exterior_hairline_cracks' AND st.step_type='repair')
   OR (p.scenario_key='repair_hairline_wall_crack' AND st.step_type='fill_repair')
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

-- Damaged plaster/render: EN 13914 gives standards-based scope for preparation,
-- application and non-structural maintenance/repair. Exact material properties,
-- layer thicknesses and curing still come from the chosen system/product.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'profile', p.id, s.id,
 CASE s.source_key
   WHEN 'bsi_en_13914_1_2016'
     THEN 'EN 13914-1 covers design, preparation, application, maintenance and non-structural repair of external render on new and old backgrounds.'
   ELSE 'EN 13914-2 covers design considerations and essential principles for internal plastering systems and their application; local/national requirements remain applicable.'
 END,
 'Scope / overview',
 'standard_based',
 CASE s.source_key
   WHEN 'bsi_en_13914_1_2016'
     THEN 'External render and non-structural repair only; excludes structural concrete repair and ETICS.'
   ELSE 'Internal plastering only; does not provide painting-system instructions or structural concrete repair.'
 END,
 true
FROM public.build_solution_profiles p
JOIN public.general_build_sources s
  ON s.source_key IN ('bsi_en_13914_1_2016','bsi_en_13914_2_2016')
WHERE p.scenario_key='repair_damaged_plaster'
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'solution_step', st.id, s.id,
 CASE s.source_key
   WHEN 'bsi_en_13914_1_2016'
     THEN 'The external-render standard covers background considerations, preparation/application and maintenance/non-structural repair.'
   ELSE 'The internal-plastering standard covers design/material considerations and application of plastering systems.'
 END,
 'Scope / overview',
 'standard_based',
 CASE s.source_key
   WHEN 'bsi_en_13914_1_2016'
     THEN 'Applicable when the damaged area is external render and the repair is non-structural.'
   ELSE 'Applicable when the damaged area is internal plaster; exact repair material and curing remain manufacturer-specific.'
 END,
 true
FROM public.build_solution_steps st
JOIN public.build_solution_profiles p ON p.id=st.scenario_id
JOIN public.general_build_sources s
  ON s.source_key IN ('bsi_en_13914_1_2016','bsi_en_13914_2_2016')
WHERE p.scenario_key='repair_damaged_plaster'
  AND st.step_type IN ('assess','repair','level_and_prepare_finish')
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'project_kit_requirement', k.id, s.id,
 'The EN 13914 family addresses selection/design/application of plaster or render systems on relevant backgrounds; the exact repair material must be compatible with the substrate and exposure.',
 'Scope / overview',
 'standard_based',
 CASE s.source_key
   WHEN 'bsi_en_13914_1_2016' THEN 'External render only.'
   ELSE 'Internal plaster only.'
 END,
 true
FROM public.build_project_kit_requirements k
JOIN public.build_solution_profiles p ON p.id=k.scenario_id
JOIN public.general_build_sources s
  ON s.source_key IN ('bsi_en_13914_1_2016','bsi_en_13914_2_2016')
WHERE p.scenario_key='repair_damaged_plaster'
  AND k.requirement_type='repair_mortar_or_plaster'
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

-- Balcony leakage/refurbishment: LRWA GN4 supplies an independent inspection,
-- suitability, drainage, preparation and compatibility pathway.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'profile', p.id, s.id,
 'LRWA Guidance Note 4 requires an existing roof/balcony to be assessed for condition and suitability before a liquid waterproofing overlay, including leaks, drainage, substrate condition and compatibility.',
 'Sections 2–4, pp. 1–4',
 'strong_consensus',
 'General waterproofing-refurbishment practice. UK regulatory references are excluded from Greek-law interpretation.',
 true
FROM public.build_solution_profiles p
JOIN public.general_build_sources s ON s.source_key='lrwa_guidance_note_4_refurbishment'
WHERE p.scenario_key='waterproof_balcony_leak'
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'diagnostic_rule', d.id, s.id,
 'The guidance distinguishes leakage from condensation and checks whether ingress is through the membrane/deck or associated details; some detail failures may not be solved by a liquid overlay.',
 'Section 2, p. 2',
 'strong_consensus',
 'Supports diagnostic questions and uncertainty handling; it does not prove the leak path without inspection.',
 true
FROM public.build_diagnostic_rules d
JOIN public.build_solution_profiles p ON p.id=d.scenario_id
JOIN public.general_build_sources s ON s.source_key='lrwa_guidance_note_4_refurbishment'
WHERE p.scenario_key='waterproof_balcony_leak'
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'solution_step', st.id, s.id,
 CASE st.step_type
   WHEN 'diagnose_source' THEN 'Inspect leakage/condensation, membrane or deck, associated details and whether underlying layers are saturated before specifying the waterproofing intervention.'
   WHEN 'inspect_details' THEN 'Inspect the whole balcony, ancillary details, outlets, attachments and existing top layer before selecting preparation and specification.'
   WHEN 'repair_substrate_details' THEN 'Clean and prepare the existing surface, remove loose material and make defects/details good before waterproofing.'
   WHEN 'execute_system' THEN 'Prime/treat and apply the selected liquid waterproofing system in accordance with the manufacturer instructions.'
   ELSE 'Verify the finished waterproofing system and relevant details after the required manufacturer-defined curing period.'
 END,
 CASE
   WHEN st.step_type='diagnose_source' THEN 'Section 2, p. 2'
   WHEN st.step_type IN ('inspect_details','repair_substrate_details') THEN 'Sections 2–4, pp. 3–4'
   ELSE 'Section 4, p. 4'
 END,
 'strong_consensus',
 'General refurbishment sequence; exact primers, layer build-up, drying and curing are manufacturer/system-specific.',
 true
FROM public.build_solution_steps st
JOIN public.build_solution_profiles p ON p.id=st.scenario_id
JOIN public.general_build_sources s ON s.source_key='lrwa_guidance_note_4_refurbishment'
WHERE p.scenario_key='waterproof_balcony_leak'
  AND st.step_type IN ('diagnose_source','inspect_details','repair_substrate_details','execute_system','cure_and_verify')
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'failure_mode', f.id, s.id,
 'Failure can recur when the ingress source, associated details, substrate condition, drainage or system compatibility have not been correctly established before overlay.',
 'Sections 2–4, pp. 2–4',
 'strong_consensus',
 'Possible causes only; no single observed symptom proves one cause.',
 true
FROM public.build_failure_modes f
JOIN public.build_solution_profiles p ON p.id=f.scenario_id
JOIN public.general_build_sources s ON s.source_key='lrwa_guidance_note_4_refurbishment'
WHERE p.scenario_key='waterproof_balcony_leak'
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'project_kit_requirement', k.id, s.id,
 CASE k.requirement_type
   WHEN 'waterproofing_kit' THEN 'The waterproofing system must be selected for the assessed balcony/substrate and installed to its specification; compatibility may require adhesion testing.'
   WHEN 'joint_or_detail_material' THEN 'Associated details, outlets, parapets, flashings and penetrations must be inspected and incorporated into a compatible waterproofing specification.'
   ELSE 'Inspection/diagnostic work precedes selection of a refurbishment waterproofing system.'
 END,
 'Sections 2–4, pp. 2–4',
 'strong_consensus',
 'Category-level requirement only; exact products/components remain manufacturer-specific.',
 true
FROM public.build_project_kit_requirements k
JOIN public.build_solution_profiles p ON p.id=k.scenario_id
JOIN public.general_build_sources s ON s.source_key='lrwa_guidance_note_4_refurbishment'
WHERE p.scenario_key='waterproof_balcony_leak'
  AND k.requirement_type IN ('waterproofing_kit','joint_or_detail_material','diagnostic_or_repair_service')
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

-- EN 14891 evidence is intentionally restricted to the under-tile branch.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page,
 evidence_strength, applicability, active)
SELECT
 'project_kit_requirement', k.id, s.id,
 'EN 14891:2017 defines performance requirements for liquid-applied waterproofing products beneath ceramic tiling on external walls/floors, but does not prescribe installation design.',
 'Abstract / scope',
 'standard_based',
 'Only when the selected balcony solution is a liquid-applied under-tile waterproofing system. Manufacturer/system installation instructions remain mandatory.',
 true
FROM public.build_project_kit_requirements k
JOIN public.build_solution_profiles p ON p.id=k.scenario_id
JOIN public.general_build_sources s ON s.source_key='elot_en_14891_2017'
WHERE p.scenario_key='waterproof_balcony_leak'
  AND k.requirement_type='waterproofing_kit'
ON CONFLICT (entity_type,entity_id,source_id) DO UPDATE SET
 supporting_passage=EXCLUDED.supporting_passage,
 relevant_section_page=EXCLUDED.relevant_section_page,
 evidence_strength=EXCLUDED.evidence_strength,
 applicability=EXCLUDED.applicability,
 active=true;

-- "verified" means the stored general guidance is source-complete. It does not
-- turn crack or leak screening into a professional diagnosis; uncertainty flags
-- and KONTA_MOU_RULE stop conditions still control those pathways.
UPDATE public.build_solution_profiles
SET evidence_status='verified',
    updated_at=now(),
    reviewed_at=now()
WHERE scenario_key IN (
 'paint_exterior_hairline_cracks',
 'repair_hairline_wall_crack',
 'repair_damaged_plaster',
 'waterproof_balcony_leak'
);

COMMIT;

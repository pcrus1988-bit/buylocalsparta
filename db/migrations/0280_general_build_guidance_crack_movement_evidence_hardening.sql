-- Layer A / Layer C evidence hardening for crack-movement screening.
-- Adds an independent public-body source for ongoing/progressive movement,
-- while keeping the conservative BLOCK decisions explicitly as KONTA MOU Layer C governance.
-- No numerical crack-width threshold, structural diagnosis or manufacturer-specific repair value is introduced.
BEGIN;

INSERT INTO public.general_build_sources
(source_key, organization, source_type, title, url, jurisdiction, standard_identifier,
 publication_date, revision, retrieved_at, relevant_section_page, source_status, notes, active)
VALUES (
  'historic_england_structural_movement_2013',
  'Historic England',
  'government_guidance',
  'Structural Movement',
  'https://historicengland.org.uk/advice/your-home/maintain-repair/structural-movement/',
  'England / building-conservation guidance; not Greek structural law',
  NULL,
  '2013-08-29',
  'Current web guidance reviewed 2026-09-22',
  now(),
  'When to consult a specialist; causes and assessment of structural movement',
  'current',
  'Used only to support general screening of ongoing/progressive movement and the need for specialist assessment when movement may be active. It is not used to import UK numerical crack thresholds or to diagnose structural cause.',
  true
)
ON CONFLICT (source_key) DO UPDATE SET
  organization=EXCLUDED.organization,
  source_type=EXCLUDED.source_type,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  jurisdiction=EXCLUDED.jurisdiction,
  publication_date=EXCLUDED.publication_date,
  revision=EXCLUDED.revision,
  retrieved_at=EXCLUDED.retrieved_at,
  relevant_section_page=EXCLUDED.relevant_section_page,
  source_status=EXCLUDED.source_status,
  notes=EXCLUDED.notes,
  active=true,
  updated_at=now();

-- Profile-level corroboration for routes whose safe use depends on separating
-- stable/cosmetic cracking from ongoing movement.
WITH profiles AS (
  SELECT id, scenario_key
  FROM public.build_solution_profiles
  WHERE source_layer='GENERAL_GUIDANCE'
    AND scenario_key IN (
      'paint_exterior_hairline_cracks',
      'repair_hairline_wall_crack',
      'repair_recurrent_or_large_wall_crack'
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'profile',
  p.id,
  src.id,
  'Historic England explains that building movement may be historic or ongoing and advises specialist inspection where movement is suspected to be continuing; this supports screening crack activity before a cosmetic repair path is treated as appropriate.',
  'When to consult a specialist',
  'context_dependent',
  CASE p.scenario_key
    WHEN 'paint_exterior_hairline_cracks' THEN 'Supports the route-level distinction between a cosmetic hairline-crack workflow and signs of ongoing movement. It does not diagnose cause or define a universal crack-width threshold.'
    WHEN 'repair_hairline_wall_crack' THEN 'Supports checking whether a nominally minor crack is stable before repair. Exact repair-material limits remain Layer B.'
    ELSE 'Supports escalation of recurrent/progressive cracking for assessment before repair. The professional-assessment decision remains KONTA MOU Layer C governance.'
  END
FROM profiles p
JOIN public.general_build_sources src
  ON src.source_key='historic_england_structural_movement_2013'
 AND src.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Diagnostic rules directly concerned with activity, progression or associated movement.
WITH targets AS (
  SELECT d.id, p.scenario_key, d.diagnostic_key
  FROM public.build_diagnostic_rules d
  JOIN public.build_solution_profiles p ON p.id=d.scenario_id
  WHERE d.active=true
    AND p.scenario_key IN (
      'paint_exterior_hairline_cracks',
      'repair_hairline_wall_crack',
      'repair_recurrent_or_large_wall_crack'
    )
    AND d.diagnostic_key IN (
      'check_crack_progression',
      'check_crack_activity',
      'progression_check',
      'associated_movement_signs'
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'diagnostic_rule',
  t.id,
  src.id,
  'Historic England distinguishes historic movement from ongoing movement and recommends specialist inspection when ongoing movement is suspected, supporting activity/progression screening rather than diagnosis from crack appearance alone.',
  'When to consult a specialist',
  'context_dependent',
  'Conservative diagnostic screening only. No numerical crack threshold or structural diagnosis is inferred; applicability is limited to deciding whether the cosmetic/repair workflow should continue or escalate.'
FROM targets t
JOIN public.general_build_sources src
  ON src.source_key='historic_england_structural_movement_2013'
 AND src.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Failure-mode corroboration for recurring cracks after a cosmetic repair.
WITH targets AS (
  SELECT f.id, p.scenario_key, f.failure_key
  FROM public.build_failure_modes f
  JOIN public.build_solution_profiles p ON p.id=f.scenario_id
  WHERE f.active=true
    AND p.scenario_key IN (
      'paint_exterior_hairline_cracks',
      'repair_hairline_wall_crack',
      'repair_recurrent_or_large_wall_crack'
    )
    AND f.failure_key IN (
      'crack_recurrence',
      'repair_crack_recurrence',
      'crack_reopens'
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'failure_mode',
  t.id,
  src.id,
  'Historic England guidance notes that ongoing movement is materially different from historic/stable movement and may require specialist assessment; recurrence or continued widening after a cosmetic repair can therefore justify re-diagnosis rather than repeated covering.',
  'When to consult a specialist',
  'context_dependent',
  'Supports the re-diagnosis/escalation principle only. It does not establish the structural cause of a recurring crack or prescribe a repair system.'
FROM targets t
JOIN public.general_build_sources src
  ON src.source_key='historic_england_structural_movement_2013'
 AND src.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Rules whose technical premise is that crack activity must be classified before cosmetic treatment.
WITH targets AS (
  SELECT r.id, p.scenario_key, r.rule_key
  FROM public.build_solution_rules r
  JOIN public.build_solution_profiles p ON p.id=r.scenario_id
  WHERE r.active=true
    AND (
      (p.scenario_key='paint_exterior_hairline_cracks'
       AND r.rule_key='crack_appearance_does_not_prove_cause')
      OR
      (p.scenario_key='repair_hairline_wall_crack'
       AND r.rule_key='hairline_crack_stability_check_first')
      OR
      (p.scenario_key='repair_recurrent_or_large_wall_crack'
       AND r.rule_key IN ('screen_for_movement','repair_only_after_classification'))
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'solution_rule',
  t.id,
  src.id,
  'Historic England describes multiple causes of structural movement and distinguishes historic from ongoing movement; suspected ongoing movement should be inspected by an appropriately qualified structural engineer rather than classified from appearance alone.',
  'What causes structural movement?; When to consult a specialist',
  'context_dependent',
  'Supports classification/escalation before cosmetic treatment. No structural diagnosis, numerical threshold or repair product is derived from this source.'
FROM targets t
JOIN public.general_build_sources src
  ON src.source_key='historic_england_structural_movement_2013'
 AND src.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Selected workflow steps where the user is explicitly asked to diagnose/monitor or stop
-- because movement may be progressive.
WITH targets AS (
  SELECT st.id, p.scenario_key, st.step_type
  FROM public.build_solution_steps st
  JOIN public.build_solution_profiles p ON p.id=st.scenario_id
  WHERE st.active=true
    AND (
      (p.scenario_key='paint_exterior_hairline_cracks'
       AND st.step_type IN ('diagnose_crack','monitor','stop_if_progressive'))
      OR
      (p.scenario_key='repair_hairline_wall_crack'
       AND st.step_type IN ('diagnose','monitor','stop_if_active'))
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'solution_step',
  t.id,
  src.id,
  'Historic England guidance supports distinguishing historic/stable movement from ongoing movement and obtaining specialist inspection where ongoing movement is suspected; this supports diagnose/monitor/stop sequencing before cosmetic crack treatment.',
  'When to consult a specialist',
  'context_dependent',
  'Supports workflow sequencing only. It does not establish cause, a universal monitoring period, a crack-width threshold or a specific repair method.'
FROM targets t
JOIN public.general_build_sources src
  ON src.source_key='historic_england_structural_movement_2013'
 AND src.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Scenario-specific Layer C stop: add independent external support for the technical premise.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  sc.id,
  src.id,
  'Historic England advises specialist inspection when movement is suspected to be ongoing, supporting escalation instead of treating progressive or associated movement as a purely cosmetic crack.',
  'When to consult a specialist',
  'context_dependent',
  'Supports only the movement-risk premise. The automatic BLOCK and professional-assessment requirement remain KONTA MOU Layer C governance.'
FROM public.build_stop_conditions sc
JOIN public.build_solution_profiles p ON p.id=sc.scenario_id
JOIN public.general_build_sources src
  ON src.source_key='historic_england_structural_movement_2013'
 AND src.active=true
WHERE p.scenario_key='repair_recurrent_or_large_wall_crack'
  AND sc.stop_key='associated_movement_requires_assessment'
  AND sc.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Global Layer C stop: add both independent external support and explicit internal-governance provenance.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  sc.id,
  src.id,
  CASE src.source_key
    WHEN 'historic_england_structural_movement_2013'
      THEN 'Historic England advises specialist inspection where movement is suspected to be ongoing, supporting escalation of progressive or displaced cracking rather than cosmetic treatment.'
    ELSE 'KONTA MOU governance blocks recommendation/application paths where symptoms may conceal unresolved structural or movement risk until the risk is assessed.'
  END,
  CASE src.source_key
    WHEN 'historic_england_structural_movement_2013' THEN 'When to consult a specialist'
    ELSE 'Truth-layer and safety governance'
  END,
  CASE src.source_key
    WHEN 'historic_england_structural_movement_2013' THEN 'context_dependent'
    ELSE 'strong_consensus'
  END,
  CASE src.source_key
    WHEN 'historic_england_structural_movement_2013'
      THEN 'Supports the technical premise that suspected ongoing movement warrants specialist assessment. The BLOCK decision remains Layer C and no numerical threshold is imported.'
    ELSE 'Internal Layer C workflow/safety provenance. This is not presented as an external construction standard.'
  END
FROM public.build_stop_conditions sc
JOIN public.general_build_sources src
  ON src.source_key IN (
    'historic_england_structural_movement_2013',
    'konta_mou_build_studio_governance_v1'
  )
 AND src.active=true
WHERE sc.scenario_id IS NULL
  AND sc.stop_key='progressive_or_displaced_crack'
  AND sc.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

DO $$
DECLARE
  src_id uuid;
  global_stop uuid;
BEGIN
  SELECT id INTO src_id
  FROM public.general_build_sources
  WHERE source_key='historic_england_structural_movement_2013'
    AND active=true;

  IF src_id IS NULL THEN
    RAISE EXCEPTION 'Historic England structural movement source missing';
  END IF;

  SELECT id INTO global_stop
  FROM public.build_stop_conditions
  WHERE scenario_id IS NULL
    AND stop_key='progressive_or_displaced_crack'
    AND active=true;

  IF global_stop IS NULL THEN
    RAISE EXCEPTION 'Global progressive/displaced crack stop missing';
  END IF;

  IF (SELECT count(*) FROM public.general_build_rule_evidence
      WHERE entity_type='stop_condition' AND entity_id=global_stop AND active=true) < 3 THEN
    RAISE EXCEPTION 'Global progressive/displaced crack stop remains under-supported';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.build_diagnostic_rules d
    JOIN public.build_solution_profiles p ON p.id=d.scenario_id
    WHERE d.active=true
      AND (
        (p.scenario_key='paint_exterior_hairline_cracks' AND d.diagnostic_key='check_crack_progression')
        OR
        (p.scenario_key='repair_hairline_wall_crack' AND d.diagnostic_key='check_crack_activity')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.general_build_rule_evidence e
        WHERE e.entity_type='diagnostic_rule'
          AND e.entity_id=d.id
          AND e.source_id=src_id
          AND e.active=true
      )
  ) THEN
    RAISE EXCEPTION 'Hairline crack movement diagnostics lack independent corroboration';
  END IF;
END
$$;

COMMIT;

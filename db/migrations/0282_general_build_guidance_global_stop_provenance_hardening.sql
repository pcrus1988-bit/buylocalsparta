-- Layer C provenance hardening for global safety/workflow stops.
-- Every external-risk-driven global stop should carry:
--   (1) external evidence for the technical premise, and
--   (2) explicit KONTA MOU internal-governance evidence for the BLOCK/WARN decision.
-- Pure truth-layer policy stops may remain internal-governance only.
BEGIN;

INSERT INTO public.general_build_sources
(source_key, organization, source_type, title, url, jurisdiction, standard_identifier,
 publication_date, revision, retrieved_at, relevant_section_page, source_status, notes, active)
VALUES (
  'uk_bsr_structural_balcony_spalling',
  'UK Building Safety Regulator / UK Government',
  'government_guidance',
  'Preparing safety case reports — structural balconies',
  'https://buildingsafety.campaign.gov.uk/building-safety-regulator-making-buildings-safer/building-safety-toolkit/safety-case-reports/preparing-safety-case-reports-structural-balconies/',
  'England / building-safety guidance; not Greek structural law',
  NULL,
  NULL,
  'Current web guidance reviewed 2026-09-22',
  now(),
  'Concrete spalling; reinforcement corrosion; short-term response and specialist assessment',
  'current',
  'Used only for the general safety premise that spalling concrete/exposed or corroding reinforcement can require prompt investigation and specialist structural assessment. It is not used to diagnose cause, structural capacity or prescribe a repair system in Greece.',
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

-- External technical premise for the structural-concrete global stop.
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  sc.id,
  src.id,
  'UK Building Safety Regulator guidance identifies concrete spalling and reinforcement corrosion as issues requiring prompt investigation and notes that specialist structural-engineer input is likely to be needed.',
  'Structural balconies — background/issues and short-term responses',
  'strong_consensus',
  'Supports only the general safety premise behind suspected structural concrete damage. It does not establish structural capacity, diagnose cause, define a Greek threshold or prescribe a repair system. The automatic BLOCK remains KONTA MOU Layer C governance.'
FROM public.build_stop_conditions sc
JOIN public.general_build_sources src
  ON src.source_key='uk_bsr_structural_balcony_spalling'
 AND src.active=true
WHERE sc.scenario_id IS NULL
  AND sc.stop_key='suspected_structural_concrete_damage'
  AND sc.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

-- Explicit internal-governance provenance for global Layer C stops whose technical
-- premise already has external evidence but whose workflow decision did not yet
-- carry a separate internal governance link.
WITH target_stops AS (
  SELECT sc.id, sc.stop_key
  FROM public.build_stop_conditions sc
  WHERE sc.scenario_id IS NULL
    AND sc.source_layer='KONTA_MOU_RULE'
    AND sc.active=true
    AND sc.stop_key IN (
      'active_water_ingress',
      'roof_ponding_unresolved',
      'severe_or_persistent_mould',
      'significant_moisture_source_uncertain',
      'suspected_structural_concrete_damage',
      'unknown_existing_coating_compatibility',
      'unsafe_work_at_height',
      'unstable_substrate'
    )
)
INSERT INTO public.general_build_rule_evidence
(entity_type, entity_id, source_id, supporting_passage, relevant_section_page, evidence_strength, applicability)
SELECT
  'stop_condition',
  t.id,
  src.id,
  'KONTA MOU governance separates external technical evidence from platform safety/workflow decisions and blocks or warns when unresolved risk, diagnosis, compatibility or safe-access conditions make automatic product/application guidance inappropriate.',
  'Truth-layer and safety governance',
  'strong_consensus',
  'Internal Layer C provenance for the workflow decision only. External evidence remains responsible for the technical premise; this internal source is not presented as an external construction standard.'
FROM target_stops t
JOIN public.general_build_sources src
  ON src.source_key='konta_mou_build_studio_governance_v1'
 AND src.active=true
ON CONFLICT (entity_type, entity_id, source_id) DO NOTHING;

DO $$
DECLARE
  concrete_stop uuid;
BEGIN
  SELECT id INTO concrete_stop
  FROM public.build_stop_conditions
  WHERE scenario_id IS NULL
    AND stop_key='suspected_structural_concrete_damage'
    AND active=true;

  IF concrete_stop IS NULL THEN
    RAISE EXCEPTION 'Global suspected_structural_concrete_damage stop missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.general_build_rule_evidence e
    JOIN public.general_build_sources s ON s.id=e.source_id
    WHERE e.entity_type='stop_condition'
      AND e.entity_id=concrete_stop
      AND e.active=true
      AND s.source_key='uk_bsr_structural_balcony_spalling'
      AND s.active=true
  ) THEN
    RAISE EXCEPTION 'Structural concrete stop lacks external technical evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.build_stop_conditions sc
    WHERE sc.scenario_id IS NULL
      AND sc.source_layer='KONTA_MOU_RULE'
      AND sc.active=true
      AND sc.stop_key IN (
        'active_water_ingress',
        'roof_ponding_unresolved',
        'severe_or_persistent_mould',
        'significant_moisture_source_uncertain',
        'suspected_structural_concrete_damage',
        'unknown_existing_coating_compatibility',
        'unsafe_work_at_height',
        'unstable_substrate'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.general_build_rule_evidence e
        JOIN public.general_build_sources s ON s.id=e.source_id
        WHERE e.entity_type='stop_condition'
          AND e.entity_id=sc.id
          AND e.active=true
          AND s.source_type='internal_governance'
          AND s.active=true
      )
  ) THEN
    RAISE EXCEPTION 'One or more global Layer C stops still lack internal-governance provenance';
  END IF;
END
$$;

COMMIT;

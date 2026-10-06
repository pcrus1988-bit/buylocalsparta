-- KONTA MOY — governed population margins, calibration provenance and analysis-plan succession.
-- Schema 0431 turns the tested bounded-raking primitive into auditable Observatory
-- infrastructure without rewriting the already-locked v1 pre-analysis plan.
--
-- v1 remains immutable historical evidence. A new pre-fieldwork v2 plan is
-- inserted, linked by an append-only supersession edge, then locked. Population
-- margins are recorded independently from response data and tied to the frozen
-- frame snapshot used for the main probability sample.

BEGIN;

CREATE TABLE public.research_population_margin_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL,
  frame_snapshot_id uuid NOT NULL REFERENCES public.research_frame_snapshots(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 240),
  source_kind text NOT NULL CHECK (source_kind IN ('frozen_frame','external_official','governed_manual')),
  source_ref text NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 500),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  methodology_version text NOT NULL CHECK (char_length(methodology_version) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_population_margin_sets_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT,
  UNIQUE (wave_id,frame_snapshot_id,source_kind)
);

CREATE TABLE public.research_population_margins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  margin_set_id uuid NOT NULL REFERENCES public.research_population_margin_sets(id) ON DELETE RESTRICT,
  dimension text NOT NULL CHECK (dimension IN ('region_code','sector_code','size_band')),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 240),
  target_total numeric(20,6) NOT NULL CHECK (target_total > 0),
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (margin_set_id,dimension,category)
);

CREATE INDEX research_population_margin_sets_wave_idx
  ON public.research_population_margin_sets(wave_id,created_at DESC);
CREATE INDEX research_population_margins_set_dimension_idx
  ON public.research_population_margins(margin_set_id,dimension,category);

ALTER TABLE public.research_population_margin_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_population_margins ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_population_margin_sets FROM anon;
    REVOKE ALL ON public.research_population_margins FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_population_margin_sets FROM authenticated;
    REVOKE ALL ON public.research_population_margins FROM authenticated;
  END IF;
END;
$research$;

GRANT SELECT,INSERT ON TABLE public.research_population_margin_sets TO bls_platform_runtime;
GRANT SELECT,INSERT ON TABLE public.research_population_margins TO bls_platform_runtime;

CREATE POLICY research_population_margin_sets_platform_runtime
ON public.research_population_margin_sets
FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_population_margins_platform_runtime
ON public.research_population_margins
FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE TRIGGER research_population_margin_sets_append_only
BEFORE UPDATE OR DELETE ON public.research_population_margin_sets
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE TRIGGER research_population_margins_append_only
BEFORE UPDATE OR DELETE ON public.research_population_margins
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_population_margin_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  frame_study_id uuid;
  frame_wave_id uuid;
BEGIN
  SELECT study_id,wave_id
  INTO frame_study_id,frame_wave_id
  FROM public.research_frame_snapshots
  WHERE id=NEW.frame_snapshot_id;

  IF frame_study_id IS NULL
     OR frame_study_id IS DISTINCT FROM NEW.study_id
     OR frame_wave_id IS DISTINCT FROM NEW.wave_id THEN
    RAISE EXCEPTION 'research population-margin frame scope mismatch';
  END IF;
  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_population_margin_sets_scope_guard
BEFORE INSERT ON public.research_population_margin_sets
FOR EACH ROW EXECUTE FUNCTION public.research_guard_population_margin_set();

REVOKE EXECUTE ON FUNCTION public.research_guard_population_margin_set() FROM PUBLIC;
DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_population_margin_set() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_population_margin_set() FROM authenticated;
  END IF;
END;
$research$;
GRANT EXECUTE ON FUNCTION public.research_guard_population_margin_set() TO bls_platform_runtime;

CREATE TABLE public.research_analysis_plan_supersessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL,
  superseded_plan_id uuid NOT NULL UNIQUE REFERENCES public.research_analysis_plans(id) ON DELETE RESTRICT,
  replacement_plan_id uuid NOT NULL UNIQUE REFERENCES public.research_analysis_plans(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_analysis_plan_supersessions_distinct_check
    CHECK (superseded_plan_id <> replacement_plan_id),
  CONSTRAINT research_analysis_plan_supersessions_wave_study_fk
    FOREIGN KEY (wave_id,study_id) REFERENCES public.research_waves(id,study_id) ON DELETE RESTRICT
);

CREATE INDEX research_analysis_plan_supersessions_wave_idx
  ON public.research_analysis_plan_supersessions(wave_id,created_at DESC);

ALTER TABLE public.research_analysis_plan_supersessions ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_analysis_plan_supersessions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_analysis_plan_supersessions FROM authenticated;
  END IF;
END;
$research$;

GRANT SELECT,INSERT ON TABLE public.research_analysis_plan_supersessions TO bls_platform_runtime;

CREATE POLICY research_analysis_plan_supersessions_platform_runtime
ON public.research_analysis_plan_supersessions
FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE TRIGGER research_analysis_plan_supersessions_append_only
BEFORE UPDATE OR DELETE ON public.research_analysis_plan_supersessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_analysis_plan_supersession()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  old_study_id uuid;
  old_wave_id uuid;
  old_instrument_id uuid;
  old_status text;
  old_created_at timestamptz;
  new_study_id uuid;
  new_wave_id uuid;
  new_instrument_id uuid;
  new_status text;
  new_created_at timestamptz;
BEGIN
  SELECT study_id,wave_id,instrument_id,status,created_at
  INTO old_study_id,old_wave_id,old_instrument_id,old_status,old_created_at
  FROM public.research_analysis_plans
  WHERE id=NEW.superseded_plan_id;

  SELECT study_id,wave_id,instrument_id,status,created_at
  INTO new_study_id,new_wave_id,new_instrument_id,new_status,new_created_at
  FROM public.research_analysis_plans
  WHERE id=NEW.replacement_plan_id;

  IF old_study_id IS NULL OR new_study_id IS NULL THEN
    RAISE EXCEPTION 'research analysis-plan supersession requires both plans';
  END IF;
  IF old_study_id IS DISTINCT FROM NEW.study_id
     OR new_study_id IS DISTINCT FROM NEW.study_id
     OR old_wave_id IS DISTINCT FROM NEW.wave_id
     OR new_wave_id IS DISTINCT FROM NEW.wave_id THEN
    RAISE EXCEPTION 'research analysis-plan supersession scope mismatch';
  END IF;
  IF old_instrument_id IS DISTINCT FROM new_instrument_id THEN
    RAISE EXCEPTION 'research analysis-plan supersession cannot cross instruments';
  END IF;
  IF old_status <> 'locked' THEN
    RAISE EXCEPTION 'only a locked research analysis plan may be superseded';
  END IF;
  IF new_status NOT IN ('draft','locked') THEN
    RAISE EXCEPTION 'replacement research analysis plan must be draft or locked';
  END IF;
  IF new_created_at < old_created_at THEN
    RAISE EXCEPTION 'replacement research analysis plan cannot predate the superseded plan';
  END IF;
  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_analysis_plan_supersessions_guard
BEFORE INSERT ON public.research_analysis_plan_supersessions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_analysis_plan_supersession();

REVOKE EXECUTE ON FUNCTION public.research_guard_analysis_plan_supersession() FROM PUBLIC;
DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_analysis_plan_supersession() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_analysis_plan_supersession() FROM authenticated;
  END IF;
END;
$research$;
GRANT EXECUTE ON FUNCTION public.research_guard_analysis_plan_supersession() TO bls_platform_runtime;

DROP INDEX IF EXISTS public.research_analysis_plans_one_locked_per_instrument_idx;

CREATE OR REPLACE FUNCTION public.research_guard_active_analysis_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status <> 'locked' THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int
  INTO active_count
  FROM public.research_analysis_plans p
  WHERE p.study_id=NEW.study_id
    AND p.wave_id=NEW.wave_id
    AND p.instrument_id=NEW.instrument_id
    AND p.status='locked'
    AND p.id<>NEW.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.research_analysis_plan_supersessions s
      WHERE s.superseded_plan_id=p.id
    );

  IF active_count > 0 THEN
    RAISE EXCEPTION 'research instrument already has an active locked analysis plan';
  END IF;
  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_analysis_plans_active_guard
BEFORE INSERT OR UPDATE OF status ON public.research_analysis_plans
FOR EACH ROW EXECUTE FUNCTION public.research_guard_active_analysis_plan();

REVOKE EXECUTE ON FUNCTION public.research_guard_active_analysis_plan() FROM PUBLIC;
DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_active_analysis_plan() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_active_analysis_plan() FROM authenticated;
  END IF;
END;
$research$;
GRANT EXECUTE ON FUNCTION public.research_guard_active_analysis_plan() TO bls_platform_runtime;

DO $research$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.research_responses
    WHERE study_id='1b1bc971-705a-4b97-92c5-202600000001'::uuid
  ) THEN
    RAISE EXCEPTION 'analysis-plan v2 amendment must be installed before respondent data exist';
  END IF;
END;
$research$;

INSERT INTO public.research_analysis_plans (
  id,study_id,wave_id,instrument_id,version,title,status,plan_json,content_sha256,locked_at
)
VALUES (
  '1b1bc971-705a-4b97-92c5-202600000431',
  '1b1bc971-705a-4b97-92c5-202600000001',
  '1b1bc971-705a-4b97-92c5-202600000101',
  '1b1bc971-705a-4b97-92c5-202600000002',
  'greek-retail-2026-plan-v2',
  'Greek Retail 2026 pre-fieldwork analysis plan · bounded calibration amendment',
  'draft',
  '{
    "schema":"kontamou.research.analysis-plan.v2",
    "studySlug":"greek-retail-2026",
    "instrumentVersion":"0.2.0",
    "classificationRule":"Analyses listed as primary or secondary are pre-specified before pilot/fieldwork. Pairwise comparisons remain explicitly exploratory. This plan supersedes v1 before respondent data are observed and adds governed calibration using only the frozen population frame.",
    "supersedes":"greek-retail-2026-plan-v1",
    "amendmentTiming":"pre_fieldwork_pre_response",
    "primaryOutcomes":[
      {"metricKey":"digital_readiness.mean","label":"Greek Retail Digital Readiness Score","estimand":"weighted_population_mean","segments":["overall","regionCode","sectorCode"]},
      {"metricKey":"retail_friction.mean","label":"Independent Retail Friction Index","estimand":"weighted_population_mean","segments":["overall","regionCode","sectorCode"]}
    ],
    "secondaryAnalyses":{"scope":"All descriptive distributions, shares, matrix-item means and scale means generated from the locked questionnaire analysis keys.","segments":["overall","regionCode","sectorCode","sizeBand"],"classification":"prespecified_secondary"},
    "exploratoryAnalyses":[{"family":"headline_pairwise_region_sector","metrics":["digital_readiness.mean","retail_friction.mean"],"dimensions":["regionCode","sectorCode"],"estimator":"pairwise_independent_strata_difference_v1","multiplicity":"benjamini_hochberg_within_metric_x_dimension"}],
    "weighting":{
      "baseWeight":"inverse_recorded_inclusion_probability",
      "nonresponseAdjustment":"within_sampling_stratum",
      "calibrationAdjustment":"bounded_raking_frozen_frame_v1",
      "calibrationDimensions":["region_code","sector_code"],
      "marginRegistryDimensions":["region_code","sector_code","size_band"],
      "marginSource":"frozen_frame",
      "maxIterations":100,
      "tolerance":0.01,
      "lowerAdjustmentBound":0.25,
      "upperAdjustmentBound":4,
      "maxWeightToMedianRatio":6,
      "extremeWeightDiagnostics":["coefficient_of_variation","kish_effective_n","weighting_design_effect","adjustment_range","trimmed_unit_count","maximum_margin_error"]
    },
    "variance":{
      "method":"stratified_srs_fpc_v1",
      "confidenceLevel":0.95,
      "withholdWhenUnsupported":true,
      "calibrationCompatibility":"region and sector raking factors remain constant inside each region-by-sector sampling stratum; variance remains fail-closed if final weights differ within a contributing stratum"
    },
    "quality":{"unresolvedReviewBlocksAnalysis":true,"excludedResponsesRemainAudited":true},
    "disclosure":{"minimumUnweightedBase":30,"smallBaseSuppression":true,"publishConventionalMarginOfError":false},
    "interpretation":{"probabilitySamplingRequiredForDesignBasedSamplingError":true,"pairwiseResultsAreExploratory":true,"effectSizeAndIntervalTakePriorityOverThresholdOnlyInterpretation":true}
  }'::jsonb,
  repeat('0',64),
  NULL
)
ON CONFLICT (wave_id,version) DO NOTHING;

INSERT INTO public.research_analysis_plan_supersessions (
  study_id,wave_id,superseded_plan_id,replacement_plan_id,reason,evidence_json
)
SELECT
  old.study_id,
  old.wave_id,
  old.id,
  replacement.id,
  'Pre-fieldwork methodological amendment: add governed population-margin registry, bounded raking calibration and explicit extreme-weight controls without modifying the historical v1 plan.',
  jsonb_build_object(
    'timing','pre_fieldwork_pre_response',
    'respondentDataObserved',false,
    'changeClass','weighting_method_amendment',
    'populationMarginSource','frozen_frame',
    'calibrationDimensions',jsonb_build_array('region_code','sector_code')
  )
FROM public.research_analysis_plans old
JOIN public.research_analysis_plans replacement
  ON replacement.study_id=old.study_id
 AND replacement.wave_id=old.wave_id
 AND replacement.instrument_id=old.instrument_id
WHERE old.version='greek-retail-2026-plan-v1'
  AND replacement.version='greek-retail-2026-plan-v2'
ON CONFLICT (superseded_plan_id) DO NOTHING;

UPDATE public.research_analysis_plans
SET status='locked'
WHERE version='greek-retail-2026-plan-v2'
  AND wave_id='1b1bc971-705a-4b97-92c5-202600000101'::uuid
  AND status='draft';

COMMIT;

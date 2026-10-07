-- KONTA MOY — pre-fieldwork analysis preregistration and analysis-plan binding.
-- Schema 0420 freezes the scientific analysis contract before pilot/fieldwork,
-- then binds every analysis run and public release back to that immutable plan.

BEGIN;

CREATE TABLE public.research_analysis_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  version text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked')),
  plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, version),
  CHECK (
    (status='draft' AND locked_at IS NULL)
    OR
    (status='locked' AND locked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX research_analysis_plans_one_locked_per_instrument_idx
  ON public.research_analysis_plans(study_id,instrument_id)
  WHERE status='locked';

ALTER TABLE public.research_analysis_runs
  ADD COLUMN analysis_plan_id uuid REFERENCES public.research_analysis_plans(id) ON DELETE RESTRICT;

CREATE INDEX research_analysis_runs_plan_idx
  ON public.research_analysis_runs(analysis_plan_id);

CREATE OR REPLACE FUNCTION public.research_prepare_analysis_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public, pg_temp
AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='locked' THEN
    RAISE EXCEPTION 'Locked research analysis plans are immutable';
  END IF;

  NEW.content_sha256 := encode(
    digest(convert_to(NEW.plan_json::text, 'UTF8'), 'sha256'),
    'hex'
  );

  IF NEW.status='locked' THEN
    NEW.locked_at := COALESCE(NEW.locked_at, now());
  ELSE
    NEW.locked_at := NULL;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.research_guard_analysis_plan_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status='locked' THEN
    RAISE EXCEPTION 'Locked research analysis plans cannot be deleted';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER research_analysis_plans_prepare
BEFORE INSERT OR UPDATE ON public.research_analysis_plans
FOR EACH ROW EXECUTE FUNCTION public.research_prepare_analysis_plan();

CREATE TRIGGER research_analysis_plans_locked_immutable
BEFORE DELETE ON public.research_analysis_plans
FOR EACH ROW EXECUTE FUNCTION public.research_guard_analysis_plan_delete();

ALTER TABLE public.research_analysis_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_analysis_plans FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_analysis_plans FROM authenticated;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.research_analysis_plans TO bls_platform_runtime;

CREATE POLICY research_analysis_plans_platform_runtime
ON public.research_analysis_plans
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

INSERT INTO public.research_analysis_plans (
  study_id,
  instrument_id,
  version,
  title,
  status,
  plan_json,
  content_sha256,
  locked_at
)
VALUES (
  '1b1bc971-705a-4b97-92c5-202600000001',
  '1b1bc971-705a-4b97-92c5-202600000002',
  'greek-retail-2026-plan-v1',
  'Greek Retail 2026 pre-fieldwork analysis plan',
  'locked',
  '{
    "schema":"kontamou.research.analysis-plan.v1",
    "studySlug":"greek-retail-2026",
    "instrumentVersion":"0.2.0",
    "classificationRule":"Analyses listed as primary or secondary are pre-specified before pilot/fieldwork. Pairwise comparisons are explicitly exploratory.",
    "primaryOutcomes":[
      {
        "metricKey":"digital_readiness.mean",
        "label":"Greek Retail Digital Readiness Score",
        "estimand":"weighted_population_mean",
        "segments":["overall","regionCode","sectorCode"]
      },
      {
        "metricKey":"retail_friction.mean",
        "label":"Independent Retail Friction Index",
        "estimand":"weighted_population_mean",
        "segments":["overall","regionCode","sectorCode"]
      }
    ],
    "secondaryAnalyses":{
      "scope":"All descriptive distributions, shares, matrix-item means and scale means generated from the locked questionnaire analysis keys.",
      "segments":["overall","regionCode","sectorCode","sizeBand"],
      "classification":"prespecified_secondary"
    },
    "exploratoryAnalyses":[
      {
        "family":"headline_pairwise_region_sector",
        "metrics":["digital_readiness.mean","retail_friction.mean"],
        "dimensions":["regionCode","sectorCode"],
        "estimator":"pairwise_independent_strata_difference_v1",
        "multiplicity":"benjamini_hochberg_within_metric_x_dimension"
      }
    ],
    "weighting":{
      "baseWeight":"inverse_recorded_inclusion_probability",
      "nonresponseAdjustment":"within_sampling_stratum",
      "calibrationAdjustment":"none_in_v1",
      "extremeWeightDiagnostics":["coefficient_of_variation","kish_effective_n","weighting_design_effect","adjustment_range"]
    },
    "variance":{
      "method":"stratified_srs_fpc_v1",
      "confidenceLevel":0.95,
      "withholdWhenUnsupported":true
    },
    "quality":{
      "unresolvedReviewBlocksAnalysis":true,
      "excludedResponsesRemainAudited":true
    },
    "disclosure":{
      "minimumUnweightedBase":30,
      "smallBaseSuppression":true,
      "publishConventionalMarginOfError":false
    },
    "interpretation":{
      "probabilitySamplingRequiredForDesignBasedSamplingError":true,
      "pairwiseResultsAreExploratory":true,
      "effectSizeAndIntervalTakePriorityOverThresholdOnlyInterpretation":true
    }
  }'::jsonb,
  repeat('0',64),
  now()
)
ON CONFLICT (study_id, version) DO NOTHING;

COMMIT;

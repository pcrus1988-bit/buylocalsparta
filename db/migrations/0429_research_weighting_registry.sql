-- KONTA MOY Retail Observatory — governed population margins and weighting specifications.
-- Schema 0429 makes calibration/weight trimming explicit evidence rather than
-- hidden analysis-code behavior. A later analysis run may only use a locked
-- weight specification; the 2026 candidate spec is intentionally created as
-- draft until methodology sign-off.

BEGIN;

CREATE TABLE public.research_population_margin_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  frame_snapshot_id uuid NOT NULL REFERENCES public.research_frame_snapshots(id) ON DELETE RESTRICT,
  version text NOT NULL,
  source_kind text NOT NULL,
  source_reference text,
  dimensions text[] NOT NULL,
  status text NOT NULL DEFAULT 'building'
    CHECK (status IN ('building','frozen','superseded')),
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id,version)
);

CREATE TABLE public.research_population_margins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  margin_set_id uuid NOT NULL REFERENCES public.research_population_margin_sets(id) ON DELETE RESTRICT,
  dimension_key text NOT NULL
    CHECK (dimension_key IN ('region_code','sector_code','size_band')),
  category_key text NOT NULL,
  population_count integer NOT NULL CHECK (population_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (margin_set_id,dimension_key,category_key)
);

CREATE TABLE public.research_weight_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked','retired')),
  base_method text NOT NULL,
  nonresponse_method text NOT NULL,
  calibration_method text NOT NULL CHECK (calibration_method IN ('none','raking')),
  calibration_dimensions text[] NOT NULL DEFAULT ARRAY[]::text[],
  trim_method text NOT NULL CHECK (trim_method IN ('none','cap_median_ratio')),
  trim_parameter numeric CHECK (trim_parameter IS NULL OR trim_parameter > 1),
  max_iterations integer NOT NULL DEFAULT 50 CHECK (max_iterations BETWEEN 1 AND 500),
  convergence_tolerance numeric NOT NULL DEFAULT 0.000001 CHECK (convergence_tolerance > 0),
  spec_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id,version),
  CHECK (
    (status='draft' AND locked_at IS NULL)
    OR
    (status IN ('locked','retired') AND locked_at IS NOT NULL)
  )
);

CREATE TABLE public.research_weight_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  sample_draw_id uuid NOT NULL REFERENCES public.research_sample_draws(id) ON DELETE RESTRICT,
  margin_set_id uuid REFERENCES public.research_population_margin_sets(id) ON DELETE RESTRICT,
  weight_spec_id uuid NOT NULL REFERENCES public.research_weight_specs(id) ON DELETE RESTRICT,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id,version)
);

ALTER TABLE public.research_weights
  ADD COLUMN weight_run_id uuid REFERENCES public.research_weight_runs(id) ON DELETE RESTRICT;

CREATE INDEX research_population_margins_set_dimension_idx
  ON public.research_population_margins(margin_set_id,dimension_key,category_key);

CREATE INDEX research_weight_runs_study_status_idx
  ON public.research_weight_runs(study_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION public.research_prepare_weight_spec()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IN ('locked','retired') THEN
    RAISE EXCEPTION 'locked research weight specification is immutable';
  END IF;

  NEW.spec_json := jsonb_build_object(
    'schema','kontamou.research.weight-spec.v1',
    'baseMethod',NEW.base_method,
    'nonresponseMethod',NEW.nonresponse_method,
    'calibrationMethod',NEW.calibration_method,
    'calibrationDimensions',to_jsonb(NEW.calibration_dimensions),
    'trimMethod',NEW.trim_method,
    'trimParameter',NEW.trim_parameter,
    'maxIterations',NEW.max_iterations,
    'convergenceTolerance',NEW.convergence_tolerance
  );
  NEW.content_sha256 := encode(digest(NEW.spec_json::text,'sha256'),'hex');

  IF NEW.status IN ('locked','retired') THEN
    NEW.locked_at := COALESCE(NEW.locked_at,now());
  ELSE
    NEW.locked_at := NULL;
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_weight_specs_prepare
BEFORE INSERT OR UPDATE ON public.research_weight_specs
FOR EACH ROW EXECUTE FUNCTION public.research_prepare_weight_spec();

CREATE OR REPLACE FUNCTION public.research_guard_frozen_margin_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.research_population_margin_sets
  WHERE id=COALESCE(NEW.margin_set_id,OLD.margin_set_id);

  IF v_status IN ('frozen','superseded') THEN
    RAISE EXCEPTION 'frozen research population margins are immutable';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$research$;

CREATE TRIGGER research_population_margins_frozen_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.research_population_margins
FOR EACH ROW EXECUTE FUNCTION public.research_guard_frozen_margin_mutation();

CREATE OR REPLACE FUNCTION public.research_freeze_frame_margins(
  p_study_id uuid,
  p_frame_snapshot_id uuid,
  p_version text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  v_set_id uuid;
  v_payload jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.research_frame_snapshots fs
    WHERE fs.id=p_frame_snapshot_id
      AND fs.study_id=p_study_id
      AND fs.status='frozen'
  ) THEN
    RAISE EXCEPTION 'population margins require the exact frozen frame';
  END IF;

  INSERT INTO public.research_population_margin_sets (
    study_id,frame_snapshot_id,version,source_kind,source_reference,dimensions,status
  ) VALUES (
    p_study_id,p_frame_snapshot_id,p_version,'frozen_frame',p_frame_snapshot_id::text,
    ARRAY['region_code','sector_code','size_band'],'building'
  )
  RETURNING id INTO v_set_id;

  INSERT INTO public.research_population_margins (
    margin_set_id,dimension_key,category_key,population_count
  )
  SELECT v_set_id,'region_code',COALESCE(NULLIF(region_code,''),'unknown'),count(*)::int
  FROM public.research_frame_units
  WHERE frame_snapshot_id=p_frame_snapshot_id AND eligibility_status='eligible'
  GROUP BY COALESCE(NULLIF(region_code,''),'unknown');

  INSERT INTO public.research_population_margins (
    margin_set_id,dimension_key,category_key,population_count
  )
  SELECT v_set_id,'sector_code',COALESCE(NULLIF(sector_code,''),'unknown'),count(*)::int
  FROM public.research_frame_units
  WHERE frame_snapshot_id=p_frame_snapshot_id AND eligibility_status='eligible'
  GROUP BY COALESCE(NULLIF(sector_code,''),'unknown');

  INSERT INTO public.research_population_margins (
    margin_set_id,dimension_key,category_key,population_count
  )
  SELECT v_set_id,'size_band',COALESCE(NULLIF(size_band,''),'unknown'),count(*)::int
  FROM public.research_frame_units
  WHERE frame_snapshot_id=p_frame_snapshot_id AND eligibility_status='eligible'
  GROUP BY COALESCE(NULLIF(size_band,''),'unknown');

  SELECT jsonb_agg(
    jsonb_build_object(
      'dimension',dimension_key,
      'category',category_key,
      'populationCount',population_count
    )
    ORDER BY dimension_key,category_key
  )
  INTO v_payload
  FROM public.research_population_margins
  WHERE margin_set_id=v_set_id;

  UPDATE public.research_population_margin_sets
  SET status='frozen',
      frozen_at=now(),
      content_sha256=encode(digest(COALESCE(v_payload,'[]'::jsonb)::text,'sha256'),'hex')
  WHERE id=v_set_id;

  RETURN v_set_id;
END;
$research$;

INSERT INTO public.research_weight_specs (
  study_id,version,status,base_method,nonresponse_method,
  calibration_method,calibration_dimensions,trim_method,trim_parameter,
  max_iterations,convergence_tolerance,spec_json,content_sha256
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000001',
  'greek-retail-2026-weight-v2-candidate',
  'draft',
  'inverse_recorded_inclusion_probability',
  'within_sampling_stratum',
  'raking',
  ARRAY['region_code','sector_code','size_band'],
  'cap_median_ratio',
  4,
  50,
  0.000001,
  '{}'::jsonb,
  repeat('0',64)
) ON CONFLICT (study_id,version) DO NOTHING;

ALTER TABLE public.research_population_margin_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_population_margins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_weight_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_weight_runs ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_population_margin_sets,public.research_population_margins,
      public.research_weight_specs,public.research_weight_runs FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_prepare_weight_spec() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_frozen_margin_mutation() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_freeze_frame_margins(uuid,uuid,text) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_population_margin_sets,public.research_population_margins,
      public.research_weight_specs,public.research_weight_runs FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_prepare_weight_spec() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_frozen_margin_mutation() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_freeze_frame_margins(uuid,uuid,text) FROM authenticated;
  END IF;
END;
$research$;

REVOKE EXECUTE ON FUNCTION public.research_prepare_weight_spec() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_frozen_margin_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_freeze_frame_margins(uuid,uuid,text) FROM PUBLIC;

GRANT SELECT,INSERT,UPDATE ON TABLE public.research_population_margin_sets TO bls_platform_runtime;
GRANT SELECT,INSERT ON TABLE public.research_population_margins TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON TABLE public.research_weight_specs TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON TABLE public.research_weight_runs TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_prepare_weight_spec() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_frozen_margin_mutation() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_freeze_frame_margins(uuid,uuid,text) TO bls_platform_runtime;

CREATE POLICY research_population_margin_sets_platform_runtime
ON public.research_population_margin_sets FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_population_margins_platform_runtime
ON public.research_population_margins FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_weight_specs_platform_runtime
ON public.research_weight_specs FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_weight_runs_platform_runtime
ON public.research_weight_runs FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMENT ON TABLE public.research_population_margin_sets IS
  'Frozen calibration target set, derived from an exact frozen frame or another declared population source.';
COMMENT ON TABLE public.research_weight_specs IS
  'Versioned pre-analysis weighting contract. Calibration and trimming must be explicit here before use.';
COMMENT ON TABLE public.research_weight_runs IS
  'One reproducible execution of a locked weight specification against a sample draw and optional margin set.';

COMMIT;

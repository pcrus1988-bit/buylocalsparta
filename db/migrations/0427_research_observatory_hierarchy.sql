-- KONTA MOY Retail Observatory — programme / study-series / wave hierarchy.
-- Schema 0427 lifts the existing operational research_studies rows into a
-- permanent Observatory hierarchy without breaking the already-governed
-- fieldwork foreign-key chain. research_studies remains the operational wave
-- record; programme and study-series identity live above it.

BEGIN;

CREATE TABLE public.research_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  public_title text NOT NULL,
  sponsor text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_study_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.research_programmes(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  title text NOT NULL,
  purpose text NOT NULL,
  target_population_definition text NOT NULL,
  core_question_contract_version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_id, slug)
);

CREATE TABLE public.research_core_question_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_series_id uuid NOT NULL REFERENCES public.research_study_series(id) ON DELETE RESTRICT,
  concept_key text NOT NULL,
  title text NOT NULL,
  construct_key text NOT NULL,
  is_core boolean NOT NULL DEFAULT true,
  definition_version text NOT NULL,
  definition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_series_id, concept_key, definition_version)
);

CREATE TABLE public.research_core_question_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid NOT NULL REFERENCES public.research_core_question_concepts(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.research_questions(id) ON DELETE RESTRICT,
  equivalence text NOT NULL DEFAULT 'exact'
    CHECK (equivalence IN ('exact','comparable','break')),
  binding_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, instrument_id),
  UNIQUE (instrument_id, question_id)
);

ALTER TABLE public.research_studies
  ADD COLUMN programme_id uuid REFERENCES public.research_programmes(id) ON DELETE RESTRICT,
  ADD COLUMN study_series_id uuid REFERENCES public.research_study_series(id) ON DELETE RESTRICT,
  ADD COLUMN wave_code text,
  ADD COLUMN wave_year integer CHECK (wave_year IS NULL OR wave_year BETWEEN 2000 AND 2200),
  ADD COLUMN wave_label text;

INSERT INTO public.research_programmes (
  id,slug,title,public_title,sponsor,description,status
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000100',
  'retail-observatory',
  'KONTA MOY Retail Observatory',
  'Παρατηρητήριο Ελληνικού Λιανεμπορίου',
  'KONTA MOY',
  'Permanent governed research programme for longitudinal, regional, sectoral and experimental evidence about Greek independent retail.',
  'active'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.research_study_series (
  id,programme_id,slug,title,purpose,target_population_definition,core_question_contract_version,status
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000110',
  '1b1bc971-705a-4b97-92c5-202600000100',
  'greek-retail-digital-transformation',
  'Greek Retail Digital Transformation',
  'Measure digital capability, economic and operational friction, local-commerce conditions, platform experience, investment intent and future readiness over time.',
  'Eligible active Greek retail businesses defined by the frozen sampling-frame rules of each wave.',
  '1.0.0',
  'active'
) ON CONFLICT (programme_id,slug) DO NOTHING;

UPDATE public.research_studies
SET
  programme_id='1b1bc971-705a-4b97-92c5-202600000100',
  study_series_id='1b1bc971-705a-4b97-92c5-202600000110',
  wave_code='2026',
  wave_year=2026,
  wave_label='Ελληνικό Λιανεμπόριο 2026'
WHERE slug='greek-retail-2026';

ALTER TABLE public.research_studies
  ALTER COLUMN programme_id SET NOT NULL,
  ALTER COLUMN study_series_id SET NOT NULL,
  ALTER COLUMN wave_code SET NOT NULL,
  ALTER COLUMN wave_year SET NOT NULL,
  ALTER COLUMN wave_label SET NOT NULL;

CREATE UNIQUE INDEX research_studies_series_wave_code_idx
  ON public.research_studies(study_series_id,wave_code);

CREATE INDEX research_studies_programme_wave_year_idx
  ON public.research_studies(programme_id,wave_year DESC);

CREATE OR REPLACE FUNCTION public.research_guard_wave_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft'
     AND (
       NEW.programme_id IS DISTINCT FROM OLD.programme_id
       OR NEW.study_series_id IS DISTINCT FROM OLD.study_series_id
       OR NEW.wave_code IS DISTINCT FROM OLD.wave_code
       OR NEW.wave_year IS DISTINCT FROM OLD.wave_year
     ) THEN
    RAISE EXCEPTION 'research wave hierarchy is immutable after draft';
  END IF;
  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_studies_wave_identity_guard
BEFORE UPDATE ON public.research_studies
FOR EACH ROW EXECUTE FUNCTION public.research_guard_wave_identity();

ALTER TABLE public.research_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_study_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_core_question_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_core_question_bindings ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_programmes,public.research_study_series,
      public.research_core_question_concepts,public.research_core_question_bindings FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_wave_identity() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_programmes,public.research_study_series,
      public.research_core_question_concepts,public.research_core_question_bindings FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_wave_identity() FROM authenticated;
  END IF;
END;
$research$;

REVOKE EXECUTE ON FUNCTION public.research_guard_wave_identity() FROM PUBLIC;

GRANT SELECT,INSERT,UPDATE ON TABLE public.research_programmes TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON TABLE public.research_study_series TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON TABLE public.research_core_question_concepts TO bls_platform_runtime;
GRANT SELECT,INSERT ON TABLE public.research_core_question_bindings TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_wave_identity() TO bls_platform_runtime;

CREATE POLICY research_programmes_platform_runtime
ON public.research_programmes FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_study_series_platform_runtime
ON public.research_study_series FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_core_question_concepts_platform_runtime
ON public.research_core_question_concepts FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_core_question_bindings_platform_runtime
ON public.research_core_question_bindings FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMENT ON TABLE public.research_programmes IS
  'Permanent research programme identity. One programme can contain multiple longitudinal study series.';
COMMENT ON TABLE public.research_study_series IS
  'Longitudinal study definition above individual operational waves.';
COMMENT ON TABLE public.research_studies IS
  'Operational research wave. Legacy table name retained so the governed 0416-0426 fieldwork chain stays stable.';
COMMENT ON TABLE public.research_core_question_concepts IS
  'Stable longitudinal concepts that may bind to exact or comparable questions across waves.';
COMMENT ON TABLE public.research_core_question_bindings IS
  'Wave/instrument binding for a stable longitudinal concept, with explicit comparability status.';

COMMIT;

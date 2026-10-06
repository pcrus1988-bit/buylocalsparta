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
  binding_version text NOT NULL DEFAULT '1.0.0',
  equivalence text NOT NULL DEFAULT 'exact'
    CHECK (equivalence IN ('exact','comparable','break')),
  harmonisation_json jsonb NOT NULL DEFAULT '{"kind":"identity"}'::jsonb,
  binding_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concept_id, instrument_id, binding_version)
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

CREATE OR REPLACE FUNCTION public.research_guard_core_concept_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'research longitudinal concept definitions are append-only';
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'research longitudinal concept definition fields are immutable; create a new definition_version';
  END IF;

  IF OLD.status='retired' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'retired research longitudinal concepts cannot be reactivated';
  END IF;
  IF OLD.status='active' AND NEW.status NOT IN ('active','retired') THEN
    RAISE EXCEPTION 'active research longitudinal concepts may only remain active or retire';
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_core_question_concepts_append_only
BEFORE UPDATE OR DELETE ON public.research_core_question_concepts
FOR EACH ROW EXECUTE FUNCTION public.research_guard_core_concept_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_core_binding_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  RAISE EXCEPTION 'research longitudinal bindings are immutable; append a new binding_version';
END;
$research$;

CREATE TRIGGER research_core_question_bindings_append_only
BEFORE UPDATE OR DELETE ON public.research_core_question_bindings
FOR EACH ROW EXECUTE FUNCTION public.research_guard_core_binding_mutation();

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_core_concept_mutation() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_core_binding_mutation() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_core_concept_mutation() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_core_binding_mutation() FROM authenticated;
  END IF;
END;
$research$;

REVOKE EXECUTE ON FUNCTION public.research_guard_core_concept_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.research_guard_core_binding_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.research_guard_core_concept_mutation() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION public.research_guard_core_binding_mutation() TO bls_platform_runtime;

WITH baseline (
  concept_key,title,construct_key,is_core,question_code,analysis_key,kind
) AS (
  VALUES
    ('respondent_role','Respondent role','fieldwork.respondent_role',false,'Q01','respondent_role','question'),
    ('business_size','Business size','business.size_band',true,'Q02','business_size','question'),
    ('sales_channels','Sales channels','commerce.sales_channels',true,'Q03','sales_channels','question'),
    ('digital_sales_share','Digital sales share','commerce.digital_sales_share',true,'Q04','digital_sales_share','question'),
    ('digital_capabilities','Digital capabilities','digital.capabilities',true,'Q05','digital_capabilities','question'),
    ('catalog_update_frequency','Catalogue update frequency','digital.catalog_update_frequency',true,'Q06','catalog_update_frequency','question'),
    ('operational_friction','Operational friction','operations.friction',true,'Q07','operational_friction','question'),
    ('top_growth_barriers','Top growth barriers','growth.barriers',true,'Q08','top_growth_barriers','question'),
    ('customer_acquisition_sources','Customer acquisition sources','growth.acquisition_sources',true,'Q09','customer_acquisition_sources','question'),
    ('acquisition_difficulty_change','Acquisition difficulty change','growth.acquisition_difficulty_change',true,'Q10','acquisition_difficulty_change','question'),
    ('local_customer_share','Local customer share','local_commerce.customer_share',true,'Q11','local_customer_share','question'),
    ('local_product_discovery_importance','Local product discovery importance','local_commerce.discovery_importance',true,'Q12','local_product_discovery_importance','question'),
    ('marketplace_experience','Marketplace experience','platforms.marketplace_experience',true,'Q13','marketplace_experience','question'),
    ('marketplace_factors','Marketplace evaluation factors','platforms.marketplace_factors',true,'Q14','marketplace_factors','question'),
    ('platform_feature_importance','Platform feature importance','platforms.feature_importance',true,'Q15','platform_feature_importance','question'),
    ('investment_intentions','Investment intentions','future.investment_intentions',true,'Q16','investment_intentions','question'),
    ('sales_outlook','Sales outlook','future.sales_outlook',true,'Q17','sales_outlook','question'),
    ('open_barrier','Open operational barrier','operations.open_barrier',false,'Q18','open_barrier','question'),
    ('digital_readiness_score','Digital Readiness Score','derived.digital_readiness',true,NULL,'digital_readiness.mean','derived'),
    ('retail_friction_index','Retail Friction Index','derived.retail_friction',true,NULL,'retail_friction.mean','derived')
)
INSERT INTO public.research_core_question_concepts (
  study_series_id,concept_key,title,construct_key,is_core,definition_version,definition_json,status
)
SELECT
  '1b1bc971-705a-4b97-92c5-202600000110',
  concept_key,
  title,
  construct_key,
  is_core,
  '1.0.0',
  jsonb_build_object(
    'kind',kind,
    'canonicalAnalysisKey',analysis_key,
    'baselineWave','2026',
    'baselineQuestionCode',question_code,
    'harmonisationContract',jsonb_build_object(
      'exact','same construct, wording, coding and scale semantics',
      'comparable','same construct with declared deterministic recode or scale bridge',
      'break','not valid for direct trend comparison'
    )
  ),
  'active'
FROM baseline
ON CONFLICT (study_series_id,concept_key,definition_version) DO NOTHING;

WITH baseline (concept_key,question_code,analysis_key) AS (
  VALUES
    ('respondent_role','Q01','respondent_role'),
    ('business_size','Q02','business_size'),
    ('sales_channels','Q03','sales_channels'),
    ('digital_sales_share','Q04','digital_sales_share'),
    ('digital_capabilities','Q05','digital_capabilities'),
    ('catalog_update_frequency','Q06','catalog_update_frequency'),
    ('operational_friction','Q07','operational_friction'),
    ('top_growth_barriers','Q08','top_growth_barriers'),
    ('customer_acquisition_sources','Q09','customer_acquisition_sources'),
    ('acquisition_difficulty_change','Q10','acquisition_difficulty_change'),
    ('local_customer_share','Q11','local_customer_share'),
    ('local_product_discovery_importance','Q12','local_product_discovery_importance'),
    ('marketplace_experience','Q13','marketplace_experience'),
    ('marketplace_factors','Q14','marketplace_factors'),
    ('platform_feature_importance','Q15','platform_feature_importance'),
    ('investment_intentions','Q16','investment_intentions'),
    ('sales_outlook','Q17','sales_outlook'),
    ('open_barrier','Q18','open_barrier')
)
INSERT INTO public.research_core_question_bindings (
  concept_id,instrument_id,question_id,binding_version,equivalence,harmonisation_json,binding_note
)
SELECT
  concept.id,
  question.instrument_id,
  question.id,
  '1.0.0',
  'exact',
  jsonb_build_object(
    'kind','identity',
    'sourceQuestionCode',baseline.question_code,
    'sourceAnalysisKey',baseline.analysis_key,
    'targetCanonicalAnalysisKey',baseline.analysis_key
  ),
  '2026 baseline identity binding. Future waves must declare exact, comparable or break explicitly.'
FROM baseline
JOIN public.research_core_question_concepts concept
  ON concept.study_series_id='1b1bc971-705a-4b97-92c5-202600000110'
 AND concept.concept_key=baseline.concept_key
 AND concept.definition_version='1.0.0'
JOIN public.research_questions question
  ON question.instrument_id='1b1bc971-705a-4b97-92c5-202600000002'
 AND question.code=baseline.question_code
ON CONFLICT (concept_id,instrument_id,binding_version) DO NOTHING;

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

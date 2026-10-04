-- KONTA MOY — Greek Retail Study 2026 research foundation.
-- Separates contact/invitation identity from survey answers, freezes the
-- questionnaire/methodology used in fieldwork, and preserves reproducible
-- sampling, permission and analysis evidence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.retail_research_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  sponsor text NOT NULL,
  population_definition text NOT NULL,
  design_type text NOT NULL CHECK (design_type IN ('census_invitation','stratified_probability_sample','nonprobability')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','fieldwork','closed','published')),
  instrument_json jsonb NOT NULL CHECK (jsonb_typeof(instrument_json) = 'object'),
  methodology_json jsonb NOT NULL CHECK (jsonb_typeof(methodology_json) = 'object'),
  instrument_sha256 text NOT NULL CHECK (instrument_sha256 ~ '^[a-f0-9]{64}$'),
  fieldwork_started_at timestamptz,
  fieldwork_closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

CREATE TABLE IF NOT EXISTS public.retail_research_strata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.retail_research_studies(id) ON DELETE CASCADE,
  stratum_key text NOT NULL,
  sector_group text NOT NULL,
  prefecture text NOT NULL DEFAULT '',
  population_count integer NOT NULL CHECK (population_count >= 0),
  sample_target integer CHECK (sample_target IS NULL OR sample_target >= 0),
  frame_snapshot_at timestamptz NOT NULL,
  frame_source text NOT NULL DEFAULT 'GEMI OpenData',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, stratum_key)
);

CREATE TABLE IF NOT EXISTS public.retail_research_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.retail_research_studies(id) ON DELETE CASCADE,
  stratum_id uuid REFERENCES public.retail_research_strata(id) ON DELETE SET NULL,
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  source_record_key text NOT NULL,
  contact_email text NOT NULL,
  contact_email_digest text NOT NULL CHECK (contact_email_digest ~ '^[a-f0-9]{64}$'),
  sector_group text NOT NULL,
  prefecture text NOT NULL DEFAULT '',
  municipality text NOT NULL DEFAULT '',
  selection_probability numeric(12,10) NOT NULL DEFAULT 1
    CHECK (selection_probability > 0 AND selection_probability <= 1),
  disposition text NOT NULL DEFAULT 'prepared'
    CHECK (disposition IN ('prepared','sent','delivered','bounced','complained','started','completed','ineligible','declined')),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  first_started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (study_id, source_record_key)
);

CREATE TABLE IF NOT EXISTS public.retail_research_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  invitation_id uuid NOT NULL UNIQUE REFERENCES public.retail_research_invitations(id) ON DELETE CASCADE,
  instrument_sha256 text NOT NULL CHECK (instrument_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','partial','complete','excluded')),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(quality_flags) = 'array'),
  exclusion_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.retail_research_answers (
  response_id uuid NOT NULL REFERENCES public.retail_research_responses(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  answer_json jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (response_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.retail_research_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.retail_research_invitations(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('research_results','konta_mou_information')),
  status text NOT NULL CHECK (status IN ('pending','confirmed','withdrawn','declined')),
  consent_text_version text NOT NULL,
  consent_text text NOT NULL,
  consented_at timestamptz,
  confirmation_token_digest text CHECK (
    confirmation_token_digest IS NULL OR confirmation_token_digest ~ '^[a-f0-9]{64}$'
  ),
  confirmed_at timestamptz,
  withdrawn_at timestamptz,
  source text NOT NULL DEFAULT 'greek_retail_study_2026',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, purpose),
  CHECK (
    (status='pending' AND consented_at IS NOT NULL)
    OR (status='confirmed' AND consented_at IS NOT NULL AND confirmed_at IS NOT NULL)
    OR (status='withdrawn' AND consented_at IS NOT NULL AND withdrawn_at IS NOT NULL)
    OR status='declined'
  )
);

CREATE TABLE IF NOT EXISTS public.retail_research_analysis_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.retail_research_studies(id) ON DELETE CASCADE,
  analysis_version text NOT NULL,
  data_cutoff timestamptz NOT NULL,
  instrument_sha256 text NOT NULL CHECK (instrument_sha256 ~ '^[a-f0-9]{64}$'),
  frame_sha256 text NOT NULL CHECK (frame_sha256 ~ '^[a-f0-9]{64}$'),
  weighting_method text NOT NULL,
  specification_json jsonb NOT NULL CHECK (jsonb_typeof(specification_json) = 'object'),
  results_json jsonb NOT NULL CHECK (jsonb_typeof(results_json) = 'object'),
  results_sha256 text NOT NULL CHECK (results_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, analysis_version, data_cutoff)
);

CREATE INDEX IF NOT EXISTS retail_research_invitations_study_disposition_idx
  ON public.retail_research_invitations(study_id, disposition);
CREATE INDEX IF NOT EXISTS retail_research_invitations_stratum_idx
  ON public.retail_research_invitations(study_id, stratum_id);
CREATE INDEX IF NOT EXISTS retail_research_invitations_sector_prefecture_idx
  ON public.retail_research_invitations(study_id, sector_group, prefecture);
CREATE INDEX IF NOT EXISTS retail_research_responses_status_idx
  ON public.retail_research_responses(status, submitted_at);
CREATE INDEX IF NOT EXISTS retail_research_answers_question_idx
  ON public.retail_research_answers(question_id);
CREATE INDEX IF NOT EXISTS retail_research_permissions_status_idx
  ON public.retail_research_permissions(purpose, status);
CREATE INDEX IF NOT EXISTS retail_research_snapshots_cutoff_idx
  ON public.retail_research_analysis_snapshots(study_id, data_cutoff DESC);

CREATE OR REPLACE FUNCTION public.guard_retail_research_study_definition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'draft'
     AND (
       NEW.instrument_sha256 IS DISTINCT FROM OLD.instrument_sha256
       OR NEW.instrument_json IS DISTINCT FROM OLD.instrument_json
       OR NEW.methodology_json IS DISTINCT FROM OLD.methodology_json
       OR NEW.design_type IS DISTINCT FROM OLD.design_type
       OR NEW.population_definition IS DISTINCT FROM OLD.population_definition
     ) THEN
    RAISE EXCEPTION 'Published/fieldwork retail research definitions are immutable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.retail_research_invitations i WHERE i.study_id = OLD.id LIMIT 1
  )
     AND (
       NEW.instrument_sha256 IS DISTINCT FROM OLD.instrument_sha256
       OR NEW.instrument_json IS DISTINCT FROM OLD.instrument_json
       OR NEW.methodology_json IS DISTINCT FROM OLD.methodology_json
     ) THEN
    RAISE EXCEPTION 'Retail research definition cannot change after invitations exist';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS retail_research_study_definition_guard ON public.retail_research_studies;
CREATE TRIGGER retail_research_study_definition_guard
BEFORE UPDATE ON public.retail_research_studies
FOR EACH ROW EXECUTE FUNCTION public.guard_retail_research_study_definition();

ALTER TABLE public.retail_research_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_research_strata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_research_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_research_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_research_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_research_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_research_analysis_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_retail_research_studies_runtime_all ON public.retail_research_studies;
CREATE POLICY bls_retail_research_studies_runtime_all ON public.retail_research_studies
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS bls_retail_research_strata_runtime_all ON public.retail_research_strata;
CREATE POLICY bls_retail_research_strata_runtime_all ON public.retail_research_strata
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS bls_retail_research_invitations_runtime_all ON public.retail_research_invitations;
CREATE POLICY bls_retail_research_invitations_runtime_all ON public.retail_research_invitations
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS bls_retail_research_responses_runtime_all ON public.retail_research_responses;
CREATE POLICY bls_retail_research_responses_runtime_all ON public.retail_research_responses
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS bls_retail_research_answers_runtime_all ON public.retail_research_answers;
CREATE POLICY bls_retail_research_answers_runtime_all ON public.retail_research_answers
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS bls_retail_research_permissions_runtime_all ON public.retail_research_permissions;
CREATE POLICY bls_retail_research_permissions_runtime_all ON public.retail_research_permissions
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS bls_retail_research_analysis_snapshots_runtime_all ON public.retail_research_analysis_snapshots;
CREATE POLICY bls_retail_research_analysis_snapshots_runtime_all ON public.retail_research_analysis_snapshots
  FOR ALL TO bls_app_runtime, bls_platform_runtime USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE
  public.retail_research_studies,
  public.retail_research_strata,
  public.retail_research_invitations,
  public.retail_research_responses,
  public.retail_research_answers,
  public.retail_research_permissions,
  public.retail_research_analysis_snapshots
FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.retail_research_studies,
  public.retail_research_strata,
  public.retail_research_invitations,
  public.retail_research_responses,
  public.retail_research_answers,
  public.retail_research_permissions,
  public.retail_research_analysis_snapshots
TO bls_app_runtime, bls_platform_runtime;

REVOKE ALL ON FUNCTION public.guard_retail_research_study_definition()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_retail_research_study_definition()
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.retail_research_studies IS
  'Immutable, versioned survey instrument and methodology definitions for reproducible KONTA MOY research.';
COMMENT ON TABLE public.retail_research_invitations IS
  'Server-private invitation/contact layer. Raw invitation tokens are never persisted; only SHA-256 digests are stored.';
COMMENT ON TABLE public.retail_research_responses IS
  'Pseudonymous response sessions separated from recipient contact fields.';
COMMENT ON TABLE public.retail_research_answers IS
  'Question-level response facts keyed only to the pseudonymous response row.';
COMMENT ON TABLE public.retail_research_permissions IS
  'Purpose-specific permission evidence kept separate from research answers.';
COMMENT ON TABLE public.retail_research_analysis_snapshots IS
  'Frozen, reproducible analysis outputs with instrument, frame, specification and result hashes.';

COMMIT;

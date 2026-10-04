-- KONTA MOY — governed survey research ecosystem.
-- Schema 411 introduces a versioned research ledger for population frames,
-- probability samples, invitations, consent, responses, experiments, weighting,
-- analysis runs and public releases. Public survey traffic never talks to these
-- tables through the Supabase Data API; the Next.js server owns all mutations.

BEGIN;

CREATE TABLE public.research_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  sponsor text NOT NULL,
  population_definition text NOT NULL,
  methodology_summary text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pilot','fielding','closed','analysis','published','archived')),
  default_locale text NOT NULL DEFAULT 'el-GR',
  fieldwork_starts_at timestamptz,
  fieldwork_ends_at timestamptz,
  public_results_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  version text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','locked','fielding','retired')),
  consent_statement_version text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, version)
);

CREATE TABLE public.research_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  code text NOT NULL,
  section_code text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  question_type text NOT NULL
    CHECK (question_type IN ('single','multi','scale','matrix','text','experiment')),
  prompt_el text NOT NULL,
  help_el text,
  required boolean NOT NULL DEFAULT true,
  analysis_key text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, code),
  UNIQUE (instrument_id, position)
);

CREATE TABLE public.research_frame_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  label text NOT NULL,
  source_kind text NOT NULL,
  source_reference text,
  population_size integer NOT NULL DEFAULT 0 CHECK (population_size >= 0),
  selection_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'building'
    CHECK (status IN ('building','frozen','superseded')),
  captured_at timestamptz,
  frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_strata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_snapshot_id uuid NOT NULL REFERENCES public.research_frame_snapshots(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  population_count integer NOT NULL DEFAULT 0 CHECK (population_count >= 0),
  target_complete_count integer NOT NULL DEFAULT 0 CHECK (target_complete_count >= 0),
  UNIQUE (frame_snapshot_id, code)
);

CREATE TABLE public.research_frame_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_snapshot_id uuid NOT NULL REFERENCES public.research_frame_snapshots(id) ON DELETE CASCADE,
  stratum_id uuid REFERENCES public.research_strata(id) ON DELETE SET NULL,
  external_key_hash text NOT NULL CHECK (external_key_hash ~ '^[a-f0-9]{64}$'),
  source_record_ref text,
  region_code text,
  sector_code text,
  size_band text,
  eligibility_status text NOT NULL DEFAULT 'eligible'
    CHECK (eligibility_status IN ('eligible','ineligible','unknown')),
  sampling_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (frame_snapshot_id, external_key_hash)
);

CREATE TABLE public.research_contact_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_unit_id uuid NOT NULL REFERENCES public.research_frame_units(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('email','phone','postal','other')),
  contact_value text NOT NULL,
  contact_value_hash text NOT NULL CHECK (contact_value_hash ~ '^[a-f0-9]{64}$'),
  source_kind text NOT NULL,
  verified_at timestamptz,
  suppression_status text NOT NULL DEFAULT 'active'
    CHECK (suppression_status IN ('active','suppressed','invalid','bounced')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (frame_unit_id, contact_type, contact_value_hash)
);

CREATE TABLE public.research_sample_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  frame_snapshot_id uuid NOT NULL REFERENCES public.research_frame_snapshots(id) ON DELETE RESTRICT,
  label text NOT NULL,
  algorithm_version text NOT NULL,
  random_seed text NOT NULL,
  target_n integer NOT NULL CHECK (target_n > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked','fielded','superseded')),
  drawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_sample_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_draw_id uuid NOT NULL REFERENCES public.research_sample_draws(id) ON DELETE CASCADE,
  frame_unit_id uuid NOT NULL REFERENCES public.research_frame_units(id) ON DELETE RESTRICT,
  stratum_id uuid REFERENCES public.research_strata(id) ON DELETE SET NULL,
  selection_order integer NOT NULL CHECK (selection_order > 0),
  inclusion_probability numeric(14,12) NOT NULL CHECK (inclusion_probability > 0 AND inclusion_probability <= 1),
  base_weight numeric(18,8) NOT NULL CHECK (base_weight > 0),
  selected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sample_draw_id, frame_unit_id),
  UNIQUE (sample_draw_id, selection_order)
);

CREATE TABLE public.research_recruitment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  version text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','postal','manual','other')),
  subject text,
  body_text text NOT NULL,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  sample_unit_id uuid REFERENCES public.research_sample_units(id) ON DELETE SET NULL,
  contact_point_id uuid REFERENCES public.research_contact_points(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.research_invite_batches(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','postal','manual','other')),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','sent','opened','started','completed','expired','suppressed')),
  sent_at timestamptz,
  first_opened_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_invite_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_id uuid NOT NULL REFERENCES public.research_invites(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created','sent','delivered','opened','started','saved','completed','bounced','suppressed','expired')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.research_sample_disposition_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sample_unit_id uuid NOT NULL REFERENCES public.research_sample_units(id) ON DELETE RESTRICT,
  disposition_code text NOT NULL
    CHECK (disposition_code IN (
      'selected','contact_pending','invited','delivered','opened','started','complete','partial',
      'refusal','noncontact','bounce','invalid_contact','ineligible','duplicate','out_of_scope',
      'unknown_eligibility','withdrawn'
    )),
  eligibility text NOT NULL DEFAULT 'unknown'
    CHECK (eligibility IN ('eligible','ineligible','unknown')),
  source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  invite_id uuid NOT NULL UNIQUE REFERENCES public.research_invites(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','withdrawn','excluded')),
  locale text NOT NULL DEFAULT 'el-GR',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_saved_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  withdrawn_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  quality_flags jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.research_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  consent_kind text NOT NULL
    CHECK (consent_kind IN ('research_participation','results_notification','thank_you_code','marketing')),
  statement_version text NOT NULL,
  granted boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'survey_ui'
);
CREATE INDEX research_consents_response_kind_time_idx
  ON public.research_consents(response_id, consent_kind, occurred_at DESC, id DESC);

CREATE TABLE public.research_answers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.research_questions(id) ON DELETE RESTRICT,
  answer jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id)
);

CREATE TABLE public.research_experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  experiment_code text NOT NULL,
  task_number integer NOT NULL CHECK (task_number > 0),
  randomization_seed text NOT NULL,
  alternative_a jsonb NOT NULL,
  alternative_b jsonb NOT NULL,
  selected text CHECK (selected IN ('a','b','none')),
  answered_at timestamptz,
  UNIQUE (response_id, experiment_code, task_number)
);

CREATE TABLE public.research_response_quality_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  rule_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('include','review','exclude')),
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'automated',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_reward_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  reward_kind text NOT NULL DEFAULT 'thank_you_code',
  reward_version text NOT NULL,
  code_hash text CHECK (code_hash IS NULL OR code_hash ~ '^[a-f0-9]{64}
  response_id uuid PRIMARY KEY REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  scoring_version text NOT NULL,
  digital_readiness_score numeric(6,2) CHECK (digital_readiness_score BETWEEN 0 AND 100),
  friction_overall_score numeric(6,2) CHECK (friction_overall_score BETWEEN 0 AND 100),
  friction_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  version text NOT NULL,
  base_weight numeric(18,8) NOT NULL DEFAULT 1 CHECK (base_weight > 0),
  nonresponse_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (nonresponse_adjustment > 0),
  calibration_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (calibration_adjustment > 0),
  final_weight numeric(18,8) NOT NULL CHECK (final_weight > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, version)
);

CREATE TABLE public.research_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  label text NOT NULL,
  code_version text NOT NULL,
  instrument_version text NOT NULL,
  weight_version text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  dataset_sha256 text CHECK (dataset_sha256 IS NULL OR dataset_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_analysis_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL REFERENCES public.research_analysis_runs(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  segment jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimate numeric,
  standard_error numeric,
  confidence_level numeric(5,4),
  ci_lower numeric,
  ci_upper numeric,
  unweighted_n integer NOT NULL CHECK (unweighted_n >= 0),
  weighted_n numeric CHECK (weighted_n IS NULL OR weighted_n >= 0),
  method text NOT NULL,
  suppressed boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_release_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  analysis_run_id uuid NOT NULL REFERENCES public.research_analysis_runs(id) ON DELETE RESTRICT,
  release_version text NOT NULL,
  methodology_json jsonb NOT NULL,
  dataset_sha256 text NOT NULL CHECK (dataset_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
  public_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, release_version)
);

CREATE TABLE public.research_study_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  job_type text NOT NULL
    CHECK (job_type IN ('frame_snapshot','contact_enrichment','sample_draw','invite_batch','weighting','analysis','release')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_questions_instrument_position_idx ON public.research_questions(instrument_id, position);
CREATE INDEX research_frame_units_snapshot_stratum_idx ON public.research_frame_units(frame_snapshot_id, stratum_id);
CREATE INDEX research_contact_points_frame_unit_idx ON public.research_contact_points(frame_unit_id);
CREATE INDEX research_sample_units_draw_stratum_idx ON public.research_sample_units(sample_draw_id, stratum_id);
CREATE INDEX research_invite_batches_study_status_idx ON public.research_invite_batches(study_id, status);
CREATE INDEX research_invites_study_status_idx ON public.research_invites(study_id, status);
CREATE INDEX research_sample_disposition_time_idx ON public.research_sample_disposition_events(sample_unit_id, occurred_at DESC, id DESC);
CREATE INDEX research_invite_events_invite_time_idx ON public.research_invite_events(invite_id, occurred_at);
CREATE INDEX research_responses_study_status_idx ON public.research_responses(study_id, status);
CREATE INDEX research_answers_response_idx ON public.research_answers(response_id);
CREATE INDEX research_quality_reviews_response_idx ON public.research_response_quality_reviews(response_id, created_at DESC);
CREATE INDEX research_analysis_estimates_run_metric_idx ON public.research_analysis_estimates(analysis_run_id, metric_key);
CREATE INDEX research_study_jobs_claim_idx ON public.research_study_jobs(status, available_at, created_at);

ALTER TABLE public.research_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_strata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_contact_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_recruitment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invite_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invite_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_disposition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_response_quality_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_reward_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_response_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_analysis_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_release_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_study_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_recruitment_templates, public.research_invite_batches,
      public.research_invites, public.research_invite_events, public.research_sample_disposition_events,
      public.research_responses, public.research_consents, public.research_answers,
      public.research_experiment_assignments, public.research_response_quality_reviews,
      public.research_reward_entitlements, public.research_response_scores, public.research_weights,
      public.research_analysis_runs, public.research_analysis_estimates,
      public.research_release_snapshots, public.research_study_jobs
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_recruitment_templates, public.research_invite_batches,
      public.research_invites, public.research_invite_events, public.research_sample_disposition_events,
      public.research_responses, public.research_consents, public.research_answers,
      public.research_experiment_assignments, public.research_response_quality_reviews,
      public.research_reward_entitlements, public.research_response_scores, public.research_weights,
      public.research_analysis_runs, public.research_analysis_estimates,
      public.research_release_snapshots, public.research_study_jobs
    FROM authenticated;
  END IF;
END $;

-- The browser/Data API roles remain denied. Server-side research operations are
-- available only to the credential-bound platform runtime role and still pass
-- through RLS. This mirrors the repository's existing platform authorization
-- model instead of relying on table ownership or service_role.
DO $
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'research_studies','research_instruments','research_questions',
    'research_frame_snapshots','research_strata','research_frame_units',
    'research_contact_points','research_sample_draws','research_sample_units',
    'research_recruitment_templates','research_invite_batches',
    'research_invites','research_invite_events','research_sample_disposition_events',
    'research_responses','research_consents','research_answers','research_experiment_assignments',
    'research_response_quality_reviews','research_reward_entitlements',
    'research_response_scores','research_weights','research_analysis_runs',
    'research_analysis_estimates','research_release_snapshots','research_study_jobs'
  ]
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO bls_platform_runtime',
      table_name
    );
    policy_name := table_name || '_platform_runtime';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO bls_platform_runtime USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()))',
      policy_name,
      table_name
    );
  END LOOP;

  GRANT USAGE, SELECT ON SEQUENCE public.research_invite_events_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_sample_disposition_events_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_consents_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_answers_id_seq TO bls_platform_runtime;
END $;

CREATE OR REPLACE FUNCTION public.research_guard_answer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE response_status text;
BEGIN
  SELECT status INTO response_status
  FROM public.research_responses
  WHERE id = COALESCE(NEW.response_id, OLD.response_id);

  IF response_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'research response is not mutable in status %', response_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_answers_mutable_only_while_in_progress
BEFORE INSERT OR UPDATE OR DELETE ON public.research_answers
FOR EACH ROW EXECUTE FUNCTION public.research_guard_answer_mutation();

CREATE TRIGGER research_invite_events_append_only
BEFORE UPDATE OR DELETE ON public.research_invite_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE TRIGGER research_sample_dispositions_append_only
BEFORE UPDATE OR DELETE ON public.research_sample_disposition_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE TRIGGER research_consents_append_only
BEFORE UPDATE OR DELETE ON public.research_consents
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_locked_instrument()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE instrument_status text;
BEGIN
  SELECT status INTO instrument_status
  FROM public.research_instruments
  WHERE id = COALESCE(NEW.instrument_id, OLD.instrument_id);

  IF instrument_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'research instrument is locked in status %', instrument_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_questions_draft_instrument_only
BEFORE INSERT OR UPDATE OR DELETE ON public.research_questions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_locked_instrument();

INSERT INTO public.research_studies (
  id, slug, title, subtitle, sponsor, population_definition, methodology_summary, status, default_locale
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000001',
  'greek-retail-2026',
  'Ελληνικό Λιανεμπόριο 2026',
  'Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή',
  'KONTA MOY',
  'Ενεργές ελληνικές εμπορικές επιχειρήσεις εντός των προκαθορισμένων ΚΑΔ της μελέτης. Η επιστημονική δειγματοληψία γίνεται από παγωμένο πλαίσιο πληθυσμού και όχι μόνο από επιχειρήσεις με διαθέσιμο email.',
  'Επαναλήψιμη μελέτη με παγωμένο πλαίσιο πληθυσμού, στρωματοποιημένη πιθανοκρατική δειγματοληψία όπου είναι εφικτή, versioned questionnaire, ξεχωριστή συγκατάθεση, καταγραφή non-response και αναπαραγώγιμη στάθμιση/ανάλυση.',
  'draft',
  'el-GR'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.research_instruments (
  id, study_id, version, content_sha256, status, consent_statement_version
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000002',
  '1b1bc971-705a-4b97-92c5-202600000001',
  '0.2.0',
  '2dd54f588e65892cd3b8bc8b073affdd95165c25bf8574c6f88db99fe5019f81',
  'draft',
  '2026-10-04-v1'
) ON CONFLICT (study_id, version) DO NOTHING;

INSERT INTO public.research_questions
  (instrument_id, code, section_code, position, question_type, prompt_el, help_el, required, analysis_key, config)
VALUES
('1b1bc971-705a-4b97-92c5-202600000002','Q01','A',1,'single','Ποιος είναι ο ρόλος σας στην επιχείρηση;',NULL,true,'respondent_role',
 '{"options":[["owner","Ιδιοκτήτης / συνιδιοκτήτης"],["management","Διοίκηση / υπεύθυνος καταστήματος"],["ecommerce","E-commerce / marketing / πωλήσεις"],["employee","Εργαζόμενος με γνώση της λειτουργίας της επιχείρησης"],["other","Άλλος ρόλος"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q02','A',2,'single','Πόσα άτομα εργάζονται σήμερα στην επιχείρηση, μαζί με τους ιδιοκτήτες;',NULL,true,'employee_band',
 '{"options":[["1","1"],["2_4","2–4"],["5_9","5–9"],["10_19","10–19"],["20_49","20–49"],["50_plus","50 ή περισσότερα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q03','A',3,'multi','Μέσω ποιων καναλιών πραγματοποιεί σήμερα πωλήσεις η επιχείρηση;','Επιλέξτε όσα ισχύουν.',true,'sales_channels',
 '{"options":[["physical","Φυσικό κατάστημα"],["own_eshop","Δικό της e-shop"],["marketplace","Marketplace / πλατφόρμα τρίτου"],["social","Social media / μηνύματα"],["phone","Τηλεφωνικές παραγγελίες"],["b2b","B2B / χονδρική"],["other","Άλλο"],["none","Δεν πραγματοποιεί αυτή τη στιγμή πωλήσεις"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q04','A',4,'single','Περίπου τι ποσοστό των λιανικών πωλήσεών σας πραγματοποιείται μέσω ψηφιακών καναλιών;',NULL,true,'digital_sales_share',
 '{"options":[["0","0%"],["1_10","1–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω / δεν μπορώ να εκτιμήσω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q05','B',5,'matrix','Σε ποιο βαθμό διαθέτει σήμερα η επιχείρηση τις παρακάτω δυνατότητες;',NULL,true,'digital_capabilities',
 '{"scale":[["no","Όχι"],["partial","Μερικώς"],["yes","Ναι, πλήρως"]],"items":[["catalog","Ψηφιακό και οργανωμένο κατάλογο προϊόντων"],["stock","Ψηφιακή παρακολούθηση αποθέματος"],["stock_sync","Αυτόματη ή συστηματική ενημέρωση αποθέματος"],["payments","Ηλεκτρονικές πληρωμές"],["orders","Κεντρική διαχείριση παραγγελιών"],["tracking","Οργάνωση αποστολών / tracking"],["tax","Ηλεκτρονική τιμολόγηση / φορολογικές διαδικασίες"],["reporting","Στοιχεία και αναφορές για την απόδοση των πωλήσεων"],["crm","Οργανωμένη διαχείριση πελατών / επαναλαμβανόμενων πελατών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q06','B',6,'single','Πόσο συχνά ενημερώνονται ψηφιακά τιμές, προϊόντα και αποθέματα;',NULL,true,'catalog_update_frequency',
 '{"options":[["realtime","Αυτόματα ή σχεδόν σε πραγματικό χρόνο"],["daily","Καθημερινά"],["few_week","Μερικές φορές την εβδομάδα"],["weekly","Περίπου εβδομαδιαία"],["rarely","Λιγότερο συχνά"],["on_demand","Μόνο όταν υπάρχει ανάγκη"],["none","Δεν υπάρχει οργανωμένο ψηφιακό σύστημα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q07','C',7,'matrix','Πόσο δύσκολο είναι για την επιχείρησή σας καθένα από τα παρακάτω;',NULL,true,'operational_friction',
 '{"scale":[["1","1 · Καθόλου δύσκολο"],["2","2 · Λίγο"],["3","3 · Μέτρια"],["4","4 · Πολύ"],["5","5 · Εξαιρετικά δύσκολο"],["na","Δεν αφορά την επιχείρησή μου"]],"items":[["catalog","Δημιουργία και συντήρηση καταλόγου προϊόντων"],["content","Φωτογραφίες και περιγραφές προϊόντων"],["stock","Έλεγχος και συγχρονισμός αποθέματος"],["pricing","Τιμές και προσφορές"],["tech","Τεχνική λειτουργία e-shop / ψηφιακών εργαλείων"],["acquisition","Εύρεση νέων πελατών / διαφήμιση"],["payments","Ηλεκτρονικές πληρωμές"],["logistics","Αποστολές και logistics"],["returns","Επιστροφές / αλλαγές προϊόντων"],["admin","Τιμολόγηση και διοικητικές διαδικασίες"],["platform_cost","Προμήθειες και κόστη τρίτων πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q08','C',8,'multi','Ποια τρία από αυτά αποτελούν σήμερα τα μεγαλύτερα εμπόδια στην ανάπτυξη της επιχείρησής σας;','Επιλέξτε έως 3.',true,'top_growth_barriers',
 '{"max":3,"options":[["catalog","Κατάλογος προϊόντων"],["content","Φωτογραφίες / περιγραφές"],["stock","Απόθεμα"],["pricing","Τιμές / προσφορές"],["tech","Τεχνική λειτουργία"],["acquisition","Εύρεση νέων πελατών"],["payments","Πληρωμές"],["logistics","Logistics"],["returns","Επιστροφές"],["admin","Διοικητικές διαδικασίες"],["platform_cost","Κόστη πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q09','D',9,'multi','Από πού προέρχονται σήμερα κυρίως οι νέοι πελάτες σας;','Επιλέξτε έως 3 κύριες πηγές.',true,'customer_acquisition_sources',
 '{"max":3,"options":[["footfall","Φυσική διέλευση / τοποθεσία καταστήματος"],["word_of_mouth","Συστάσεις / word of mouth"],["google","Google / αναζητήσεις"],["organic_social","Social media χωρίς πληρωμένη διαφήμιση"],["paid_ads","Πληρωμένη online διαφήμιση"],["marketplace","Marketplace"],["own_eshop","Δικό μας e-shop"],["local","Τοπικές δράσεις / εκδηλώσεις / συνεργασίες"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q10','D',10,'scale','Πόσο δύσκολο είναι σήμερα να αποκτήσετε έναν νέο πελάτη σε σχέση με πριν από 2–3 χρόνια;','0 = πολύ ευκολότερο · 5 = περίπου το ίδιο · 10 = πολύ δυσκολότερο',true,'acquisition_difficulty_change',
 '{"min":0,"max":10,"step":1}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q11','D',11,'single','Περίπου τι ποσοστό των πελατών σας βρίσκεται στην ίδια τοπική περιοχή με την επιχείρηση;',NULL,true,'local_customer_share',
 '{"options":[["0_10","0–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q12','D',12,'scale','Πόσο σημαντικό θα ήταν για την επιχείρησή σας να μπορεί ένας καταναλωτής που βρίσκεται κοντά σας να ανακαλύψει εύκολα online ότι διαθέτετε το προϊόν που ψάχνει;',NULL,true,'local_product_discovery_importance',
 '{"min":1,"max":5,"step":1,"labels":{"1":"Καθόλου σημαντικό","5":"Εξαιρετικά σημαντικό"}}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q13','E',13,'single','Ποια είναι η εμπειρία σας με marketplaces ή άλλες πλατφόρμες πώλησης;',NULL,true,'marketplace_experience',
 '{"options":[["current","Χρησιμοποιούμε σήμερα μία ή περισσότερες"],["past","Χρησιμοποιούσαμε στο παρελθόν"],["considering","Το εξετάζουμε"],["never","Δεν έχουμε χρησιμοποιήσει ποτέ"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q14','E',14,'matrix','Πόσο σημαντικοί είναι οι παρακάτω παράγοντες όταν αξιολογείτε μια marketplace πλατφόρμα;',NULL,true,'marketplace_factors',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["reach","Πρόσβαση σε περισσότερους πελάτες"],["national","Προβολή σε όλη την Ελλάδα"],["local","Προβολή σε πελάτες της τοπικής περιοχής"],["commission","Κόστος / προμήθεια ανά πώληση"],["subscription","Σταθερή μηνιαία συνδρομή"],["catalog_time","Χρόνος διαχείρισης καταλόγου"],["customer_control","Έλεγχος της σχέσης με τον πελάτη"],["pricing_control","Έλεγχος της τιμολογιακής πολιτικής"],["payments","Διαχείριση πληρωμών"],["shipping","Διαχείριση αποστολών"],["returns","Διαχείριση επιστροφών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q15','E',15,'matrix','Πόσο σημαντικά θα ήταν τα παρακάτω σε μια ψηφιακή εμπορική πλατφόρμα;',NULL,true,'platform_feature_importance',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["low_commission","Χαμηλή προμήθεια"],["predictable_cost","Προβλέψιμο σταθερό κόστος"],["customer_relationship","Δυνατότητα διατήρησης της σχέσης με τον πελάτη"],["single_listing","Καταχώρηση προϊόντος μία φορά"],["stock_sync","Αυτόματος συγχρονισμός αποθέματος"],["pickup","Τοπική παραλαβή από κατάστημα"],["national_shipping","Πανελλαδικές αποστολές"],["checkout","Κοινή διαδικασία πληρωμής"],["returns","Υποστήριξη επιστροφών"],["marketing","Προβολή / marketing των προϊόντων"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q16','F',16,'multi','Σε ποιους τομείς σχεδιάζει η επιχείρηση να επενδύσει μέσα στους επόμενους 12 μήνες;','Επιλέξτε όσα ισχύουν.',true,'investment_intentions',
 '{"options":[["eshop","E-shop"],["ads","Ψηφιακή διαφήμιση"],["social","Social media"],["marketplace","Marketplace"],["erp","ERP / απόθεμα / επιχειρησιακό λογισμικό"],["content","Φωτογραφίες / περιεχόμενο προϊόντων"],["logistics","Logistics / αποστολές"],["physical","Φυσικό κατάστημα"],["training","Εκπαίδευση προσωπικού"],["none","Δεν σχεδιάζεται κάποια σημαντική επένδυση"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q17','F',17,'single','Πώς περιμένετε να εξελιχθούν οι πωλήσεις της επιχείρησής σας τους επόμενους 12 μήνες;',NULL,true,'sales_outlook',
 '{"options":[["down_large","Σημαντική μείωση"],["down_small","Μικρή μείωση"],["stable","Περίπου σταθερές"],["up_small","Μικρή αύξηση"],["up_large","Σημαντική αύξηση"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q18','F',18,'text','Αν μπορούσατε να εξαφανίσετε ένα μόνο εμπόδιο από την καθημερινή λειτουργία ή ανάπτυξη της επιχείρησής σας, ποιο θα ήταν;',NULL,false,'open_barrier',
 '{"maxLength":1500}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','EXP01','X',19,'experiment','Ποια από τις δύο υποθετικές ψηφιακές εμπορικές υπηρεσίες θα προτιμούσατε;','Θα εμφανιστούν 3 ανεξάρτητες συγκρίσεις. Οι υπηρεσίες είναι ερευνητικά σενάρια, όχι πραγματικές εμπορικές προσφορές.',false,'platform_choice_experiment',
 '{"tasks":3,"choice":["a","b","none"],"attributes":{"monthly_fee_eur":[0,29,69,129],"commission_pct":[0,3,7,12],"reach":["local","national","local_national"],"catalog":["manual","single_import","automatic_sync"],"customer_relationship":["platform_only","merchant_access"],"stock_sync":["none","daily","realtime"],"operations":["listing_only","payments","payments_shipping_returns"]}}'::jsonb)
ON CONFLICT (instrument_id, code) DO NOTHING;

COMMIT;
),
  purpose text NOT NULL DEFAULT 'research_invitation',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  UNIQUE (study_id, version, channel)
);

CREATE TABLE public.research_invite_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  sample_draw_id uuid NOT NULL REFERENCES public.research_sample_draws(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  recruitment_template_id uuid REFERENCES public.research_recruitment_templates(id) ON DELETE RESTRICT,
  label text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','postal','manual','other')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','sending','complete','cancelled')),
  planned_count integer NOT NULL DEFAULT 0 CHECK (planned_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE public.research_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  sample_unit_id uuid REFERENCES public.research_sample_units(id) ON DELETE SET NULL,
  contact_point_id uuid REFERENCES public.research_contact_points(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','postal','manual','other')),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','sent','opened','started','completed','expired','suppressed')),
  sent_at timestamptz,
  first_opened_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_invite_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_id uuid NOT NULL REFERENCES public.research_invites(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created','sent','delivered','opened','started','saved','completed','bounced','suppressed','expired')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.research_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  invite_id uuid NOT NULL UNIQUE REFERENCES public.research_invites(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','withdrawn','excluded')),
  locale text NOT NULL DEFAULT 'el-GR',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_saved_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  withdrawn_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  quality_flags jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.research_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  consent_kind text NOT NULL
    CHECK (consent_kind IN ('research_participation','results_notification','thank_you_code','marketing')),
  statement_version text NOT NULL,
  granted boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'survey_ui'
);
CREATE INDEX research_consents_response_kind_time_idx
  ON public.research_consents(response_id, consent_kind, occurred_at DESC, id DESC);

CREATE TABLE public.research_answers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.research_questions(id) ON DELETE RESTRICT,
  answer jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id)
);

CREATE TABLE public.research_experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  experiment_code text NOT NULL,
  task_number integer NOT NULL CHECK (task_number > 0),
  randomization_seed text NOT NULL,
  alternative_a jsonb NOT NULL,
  alternative_b jsonb NOT NULL,
  selected text CHECK (selected IN ('a','b','none')),
  answered_at timestamptz,
  UNIQUE (response_id, experiment_code, task_number)
);

CREATE TABLE public.research_response_scores (
  response_id uuid PRIMARY KEY REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  scoring_version text NOT NULL,
  digital_readiness_score numeric(6,2) CHECK (digital_readiness_score BETWEEN 0 AND 100),
  friction_overall_score numeric(6,2) CHECK (friction_overall_score BETWEEN 0 AND 100),
  friction_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  version text NOT NULL,
  base_weight numeric(18,8) NOT NULL DEFAULT 1 CHECK (base_weight > 0),
  nonresponse_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (nonresponse_adjustment > 0),
  calibration_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (calibration_adjustment > 0),
  final_weight numeric(18,8) NOT NULL CHECK (final_weight > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, version)
);

CREATE TABLE public.research_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  label text NOT NULL,
  code_version text NOT NULL,
  instrument_version text NOT NULL,
  weight_version text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  dataset_sha256 text CHECK (dataset_sha256 IS NULL OR dataset_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_release_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  analysis_run_id uuid NOT NULL REFERENCES public.research_analysis_runs(id) ON DELETE RESTRICT,
  release_version text NOT NULL,
  methodology_json jsonb NOT NULL,
  dataset_sha256 text NOT NULL CHECK (dataset_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
  public_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, release_version)
);

CREATE TABLE public.research_study_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  job_type text NOT NULL
    CHECK (job_type IN ('frame_snapshot','contact_enrichment','sample_draw','invite_batch','weighting','analysis','release')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_questions_instrument_position_idx ON public.research_questions(instrument_id, position);
CREATE INDEX research_frame_units_snapshot_stratum_idx ON public.research_frame_units(frame_snapshot_id, stratum_id);
CREATE INDEX research_contact_points_frame_unit_idx ON public.research_contact_points(frame_unit_id);
CREATE INDEX research_sample_units_draw_stratum_idx ON public.research_sample_units(sample_draw_id, stratum_id);
CREATE INDEX research_invites_study_status_idx ON public.research_invites(study_id, status);
CREATE INDEX research_invite_events_invite_time_idx ON public.research_invite_events(invite_id, occurred_at);
CREATE INDEX research_responses_study_status_idx ON public.research_responses(study_id, status);
CREATE INDEX research_answers_response_idx ON public.research_answers(response_id);
CREATE INDEX research_study_jobs_claim_idx ON public.research_study_jobs(status, available_at, created_at);

ALTER TABLE public.research_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_strata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_contact_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invite_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_response_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_release_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_study_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_invites, public.research_invite_events, public.research_responses,
      public.research_consents, public.research_answers, public.research_experiment_assignments,
      public.research_response_scores, public.research_weights, public.research_analysis_runs,
      public.research_release_snapshots, public.research_study_jobs
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_invites, public.research_invite_events, public.research_responses,
      public.research_consents, public.research_answers, public.research_experiment_assignments,
      public.research_response_scores, public.research_weights, public.research_analysis_runs,
      public.research_release_snapshots, public.research_study_jobs
    FROM authenticated;
  END IF;
END $;

-- The browser/Data API roles remain denied. Server-side research operations are
-- available only to the credential-bound platform runtime role and still pass
-- through RLS. This mirrors the repository's existing platform authorization
-- model instead of relying on table ownership or service_role.
DO $
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'research_studies','research_instruments','research_questions',
    'research_frame_snapshots','research_strata','research_frame_units',
    'research_contact_points','research_sample_draws','research_sample_units',
    'research_invites','research_invite_events','research_responses',
    'research_consents','research_answers','research_experiment_assignments',
    'research_response_scores','research_weights','research_analysis_runs',
    'research_release_snapshots','research_study_jobs'
  ]
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO bls_platform_runtime',
      table_name
    );
    policy_name := table_name || '_platform_runtime';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO bls_platform_runtime USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()))',
      policy_name,
      table_name
    );
  END LOOP;

  GRANT USAGE, SELECT ON SEQUENCE public.research_invite_events_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_consents_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_answers_id_seq TO bls_platform_runtime;
END $;

CREATE OR REPLACE FUNCTION public.research_guard_answer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE response_status text;
BEGIN
  SELECT status INTO response_status
  FROM public.research_responses
  WHERE id = COALESCE(NEW.response_id, OLD.response_id);

  IF response_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'research response is not mutable in status %', response_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_answers_mutable_only_while_in_progress
BEFORE INSERT OR UPDATE OR DELETE ON public.research_answers
FOR EACH ROW EXECUTE FUNCTION public.research_guard_answer_mutation();

CREATE TRIGGER research_invite_events_append_only
BEFORE UPDATE OR DELETE ON public.research_invite_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE TRIGGER research_consents_append_only
BEFORE UPDATE OR DELETE ON public.research_consents
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_locked_instrument()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE instrument_status text;
BEGIN
  SELECT status INTO instrument_status
  FROM public.research_instruments
  WHERE id = COALESCE(NEW.instrument_id, OLD.instrument_id);

  IF instrument_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'research instrument is locked in status %', instrument_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_questions_draft_instrument_only
BEFORE INSERT OR UPDATE OR DELETE ON public.research_questions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_locked_instrument();

INSERT INTO public.research_studies (
  id, slug, title, subtitle, sponsor, population_definition, methodology_summary, status, default_locale
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000001',
  'greek-retail-2026',
  'Ελληνικό Λιανεμπόριο 2026',
  'Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή',
  'KONTA MOY',
  'Ενεργές ελληνικές εμπορικές επιχειρήσεις εντός των προκαθορισμένων ΚΑΔ της μελέτης. Η επιστημονική δειγματοληψία γίνεται από παγωμένο πλαίσιο πληθυσμού και όχι μόνο από επιχειρήσεις με διαθέσιμο email.',
  'Επαναλήψιμη μελέτη με παγωμένο πλαίσιο πληθυσμού, στρωματοποιημένη πιθανοκρατική δειγματοληψία όπου είναι εφικτή, versioned questionnaire, ξεχωριστή συγκατάθεση, καταγραφή non-response και αναπαραγώγιμη στάθμιση/ανάλυση.',
  'draft',
  'el-GR'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.research_instruments (
  id, study_id, version, content_sha256, status, consent_statement_version
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000002',
  '1b1bc971-705a-4b97-92c5-202600000001',
  '0.2.0',
  '2dd54f588e65892cd3b8bc8b073affdd95165c25bf8574c6f88db99fe5019f81',
  'draft',
  '2026-10-04-v1'
) ON CONFLICT (study_id, version) DO NOTHING;

INSERT INTO public.research_questions
  (instrument_id, code, section_code, position, question_type, prompt_el, help_el, required, analysis_key, config)
VALUES
('1b1bc971-705a-4b97-92c5-202600000002','Q01','A',1,'single','Ποιος είναι ο ρόλος σας στην επιχείρηση;',NULL,true,'respondent_role',
 '{"options":[["owner","Ιδιοκτήτης / συνιδιοκτήτης"],["management","Διοίκηση / υπεύθυνος καταστήματος"],["ecommerce","E-commerce / marketing / πωλήσεις"],["employee","Εργαζόμενος με γνώση της λειτουργίας της επιχείρησης"],["other","Άλλος ρόλος"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q02','A',2,'single','Πόσα άτομα εργάζονται σήμερα στην επιχείρηση, μαζί με τους ιδιοκτήτες;',NULL,true,'employee_band',
 '{"options":[["1","1"],["2_4","2–4"],["5_9","5–9"],["10_19","10–19"],["20_49","20–49"],["50_plus","50 ή περισσότερα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q03','A',3,'multi','Μέσω ποιων καναλιών πραγματοποιεί σήμερα πωλήσεις η επιχείρηση;','Επιλέξτε όσα ισχύουν.',true,'sales_channels',
 '{"options":[["physical","Φυσικό κατάστημα"],["own_eshop","Δικό της e-shop"],["marketplace","Marketplace / πλατφόρμα τρίτου"],["social","Social media / μηνύματα"],["phone","Τηλεφωνικές παραγγελίες"],["b2b","B2B / χονδρική"],["other","Άλλο"],["none","Δεν πραγματοποιεί αυτή τη στιγμή πωλήσεις"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q04','A',4,'single','Περίπου τι ποσοστό των λιανικών πωλήσεών σας πραγματοποιείται μέσω ψηφιακών καναλιών;',NULL,true,'digital_sales_share',
 '{"options":[["0","0%"],["1_10","1–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω / δεν μπορώ να εκτιμήσω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q05','B',5,'matrix','Σε ποιο βαθμό διαθέτει σήμερα η επιχείρηση τις παρακάτω δυνατότητες;',NULL,true,'digital_capabilities',
 '{"scale":[["no","Όχι"],["partial","Μερικώς"],["yes","Ναι, πλήρως"]],"items":[["catalog","Ψηφιακό και οργανωμένο κατάλογο προϊόντων"],["stock","Ψηφιακή παρακολούθηση αποθέματος"],["stock_sync","Αυτόματη ή συστηματική ενημέρωση αποθέματος"],["payments","Ηλεκτρονικές πληρωμές"],["orders","Κεντρική διαχείριση παραγγελιών"],["tracking","Οργάνωση αποστολών / tracking"],["tax","Ηλεκτρονική τιμολόγηση / φορολογικές διαδικασίες"],["reporting","Στοιχεία και αναφορές για την απόδοση των πωλήσεων"],["crm","Οργανωμένη διαχείριση πελατών / επαναλαμβανόμενων πελατών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q06','B',6,'single','Πόσο συχνά ενημερώνονται ψηφιακά τιμές, προϊόντα και αποθέματα;',NULL,true,'catalog_update_frequency',
 '{"options":[["realtime","Αυτόματα ή σχεδόν σε πραγματικό χρόνο"],["daily","Καθημερινά"],["few_week","Μερικές φορές την εβδομάδα"],["weekly","Περίπου εβδομαδιαία"],["rarely","Λιγότερο συχνά"],["on_demand","Μόνο όταν υπάρχει ανάγκη"],["none","Δεν υπάρχει οργανωμένο ψηφιακό σύστημα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q07','C',7,'matrix','Πόσο δύσκολο είναι για την επιχείρησή σας καθένα από τα παρακάτω;',NULL,true,'operational_friction',
 '{"scale":[["1","1 · Καθόλου δύσκολο"],["2","2 · Λίγο"],["3","3 · Μέτρια"],["4","4 · Πολύ"],["5","5 · Εξαιρετικά δύσκολο"],["na","Δεν αφορά την επιχείρησή μου"]],"items":[["catalog","Δημιουργία και συντήρηση καταλόγου προϊόντων"],["content","Φωτογραφίες και περιγραφές προϊόντων"],["stock","Έλεγχος και συγχρονισμός αποθέματος"],["pricing","Τιμές και προσφορές"],["tech","Τεχνική λειτουργία e-shop / ψηφιακών εργαλείων"],["acquisition","Εύρεση νέων πελατών / διαφήμιση"],["payments","Ηλεκτρονικές πληρωμές"],["logistics","Αποστολές και logistics"],["returns","Επιστροφές / αλλαγές προϊόντων"],["admin","Τιμολόγηση και διοικητικές διαδικασίες"],["platform_cost","Προμήθειες και κόστη τρίτων πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q08','C',8,'multi','Ποια τρία από αυτά αποτελούν σήμερα τα μεγαλύτερα εμπόδια στην ανάπτυξη της επιχείρησής σας;','Επιλέξτε έως 3.',true,'top_growth_barriers',
 '{"max":3,"options":[["catalog","Κατάλογος προϊόντων"],["content","Φωτογραφίες / περιγραφές"],["stock","Απόθεμα"],["pricing","Τιμές / προσφορές"],["tech","Τεχνική λειτουργία"],["acquisition","Εύρεση νέων πελατών"],["payments","Πληρωμές"],["logistics","Logistics"],["returns","Επιστροφές"],["admin","Διοικητικές διαδικασίες"],["platform_cost","Κόστη πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q09','D',9,'multi','Από πού προέρχονται σήμερα κυρίως οι νέοι πελάτες σας;','Επιλέξτε έως 3 κύριες πηγές.',true,'customer_acquisition_sources',
 '{"max":3,"options":[["footfall","Φυσική διέλευση / τοποθεσία καταστήματος"],["word_of_mouth","Συστάσεις / word of mouth"],["google","Google / αναζητήσεις"],["organic_social","Social media χωρίς πληρωμένη διαφήμιση"],["paid_ads","Πληρωμένη online διαφήμιση"],["marketplace","Marketplace"],["own_eshop","Δικό μας e-shop"],["local","Τοπικές δράσεις / εκδηλώσεις / συνεργασίες"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q10','D',10,'scale','Πόσο δύσκολο είναι σήμερα να αποκτήσετε έναν νέο πελάτη σε σχέση με πριν από 2–3 χρόνια;','0 = πολύ ευκολότερο · 5 = περίπου το ίδιο · 10 = πολύ δυσκολότερο',true,'acquisition_difficulty_change',
 '{"min":0,"max":10,"step":1}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q11','D',11,'single','Περίπου τι ποσοστό των πελατών σας βρίσκεται στην ίδια τοπική περιοχή με την επιχείρηση;',NULL,true,'local_customer_share',
 '{"options":[["0_10","0–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q12','D',12,'scale','Πόσο σημαντικό θα ήταν για την επιχείρησή σας να μπορεί ένας καταναλωτής που βρίσκεται κοντά σας να ανακαλύψει εύκολα online ότι διαθέτετε το προϊόν που ψάχνει;',NULL,true,'local_product_discovery_importance',
 '{"min":1,"max":5,"step":1,"labels":{"1":"Καθόλου σημαντικό","5":"Εξαιρετικά σημαντικό"}}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q13','E',13,'single','Ποια είναι η εμπειρία σας με marketplaces ή άλλες πλατφόρμες πώλησης;',NULL,true,'marketplace_experience',
 '{"options":[["current","Χρησιμοποιούμε σήμερα μία ή περισσότερες"],["past","Χρησιμοποιούσαμε στο παρελθόν"],["considering","Το εξετάζουμε"],["never","Δεν έχουμε χρησιμοποιήσει ποτέ"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q14','E',14,'matrix','Πόσο σημαντικοί είναι οι παρακάτω παράγοντες όταν αξιολογείτε μια marketplace πλατφόρμα;',NULL,true,'marketplace_factors',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["reach","Πρόσβαση σε περισσότερους πελάτες"],["national","Προβολή σε όλη την Ελλάδα"],["local","Προβολή σε πελάτες της τοπικής περιοχής"],["commission","Κόστος / προμήθεια ανά πώληση"],["subscription","Σταθερή μηνιαία συνδρομή"],["catalog_time","Χρόνος διαχείρισης καταλόγου"],["customer_control","Έλεγχος της σχέσης με τον πελάτη"],["pricing_control","Έλεγχος της τιμολογιακής πολιτικής"],["payments","Διαχείριση πληρωμών"],["shipping","Διαχείριση αποστολών"],["returns","Διαχείριση επιστροφών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q15','E',15,'matrix','Πόσο σημαντικά θα ήταν τα παρακάτω σε μια ψηφιακή εμπορική πλατφόρμα;',NULL,true,'platform_feature_importance',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["low_commission","Χαμηλή προμήθεια"],["predictable_cost","Προβλέψιμο σταθερό κόστος"],["customer_relationship","Δυνατότητα διατήρησης της σχέσης με τον πελάτη"],["single_listing","Καταχώρηση προϊόντος μία φορά"],["stock_sync","Αυτόματος συγχρονισμός αποθέματος"],["pickup","Τοπική παραλαβή από κατάστημα"],["national_shipping","Πανελλαδικές αποστολές"],["checkout","Κοινή διαδικασία πληρωμής"],["returns","Υποστήριξη επιστροφών"],["marketing","Προβολή / marketing των προϊόντων"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q16','F',16,'multi','Σε ποιους τομείς σχεδιάζει η επιχείρηση να επενδύσει μέσα στους επόμενους 12 μήνες;','Επιλέξτε όσα ισχύουν.',true,'investment_intentions',
 '{"options":[["eshop","E-shop"],["ads","Ψηφιακή διαφήμιση"],["social","Social media"],["marketplace","Marketplace"],["erp","ERP / απόθεμα / επιχειρησιακό λογισμικό"],["content","Φωτογραφίες / περιεχόμενο προϊόντων"],["logistics","Logistics / αποστολές"],["physical","Φυσικό κατάστημα"],["training","Εκπαίδευση προσωπικού"],["none","Δεν σχεδιάζεται κάποια σημαντική επένδυση"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q17','F',17,'single','Πώς περιμένετε να εξελιχθούν οι πωλήσεις της επιχείρησής σας τους επόμενους 12 μήνες;',NULL,true,'sales_outlook',
 '{"options":[["down_large","Σημαντική μείωση"],["down_small","Μικρή μείωση"],["stable","Περίπου σταθερές"],["up_small","Μικρή αύξηση"],["up_large","Σημαντική αύξηση"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q18','F',18,'text','Αν μπορούσατε να εξαφανίσετε ένα μόνο εμπόδιο από την καθημερινή λειτουργία ή ανάπτυξη της επιχείρησής σας, ποιο θα ήταν;',NULL,false,'open_barrier',
 '{"maxLength":1500}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','EXP01','X',19,'experiment','Ποια από τις δύο υποθετικές ψηφιακές εμπορικές υπηρεσίες θα προτιμούσατε;','Θα εμφανιστούν 3 ανεξάρτητες συγκρίσεις. Οι υπηρεσίες είναι ερευνητικά σενάρια, όχι πραγματικές εμπορικές προσφορές.',false,'platform_choice_experiment',
 '{"tasks":3,"choice":["a","b","none"],"attributes":{"monthly_fee_eur":[0,29,69,129],"commission_pct":[0,3,7,12],"reach":["local","national","local_national"],"catalog":["manual","single_import","automatic_sync"],"customer_relationship":["platform_only","merchant_access"],"stock_sync":["none","daily","realtime"],"operations":["listing_only","payments","payments_shipping_returns"]}}'::jsonb)
ON CONFLICT (instrument_id, code) DO NOTHING;

COMMIT;
),
  status text NOT NULL DEFAULT 'eligible'
    CHECK (status IN ('eligible','issued','redeemed','expired','cancelled')),
  issued_at timestamptz,
  redeemed_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, reward_kind, reward_version)
);

CREATE TABLE public.research_response_scores (
  response_id uuid PRIMARY KEY REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  scoring_version text NOT NULL,
  digital_readiness_score numeric(6,2) CHECK (digital_readiness_score BETWEEN 0 AND 100),
  friction_overall_score numeric(6,2) CHECK (friction_overall_score BETWEEN 0 AND 100),
  friction_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  version text NOT NULL,
  base_weight numeric(18,8) NOT NULL DEFAULT 1 CHECK (base_weight > 0),
  nonresponse_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (nonresponse_adjustment > 0),
  calibration_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (calibration_adjustment > 0),
  final_weight numeric(18,8) NOT NULL CHECK (final_weight > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, version)
);

CREATE TABLE public.research_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  label text NOT NULL,
  code_version text NOT NULL,
  instrument_version text NOT NULL,
  weight_version text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  dataset_sha256 text CHECK (dataset_sha256 IS NULL OR dataset_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_release_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  analysis_run_id uuid NOT NULL REFERENCES public.research_analysis_runs(id) ON DELETE RESTRICT,
  release_version text NOT NULL,
  methodology_json jsonb NOT NULL,
  dataset_sha256 text NOT NULL CHECK (dataset_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
  public_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, release_version)
);

CREATE TABLE public.research_study_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  job_type text NOT NULL
    CHECK (job_type IN ('frame_snapshot','contact_enrichment','sample_draw','invite_batch','weighting','analysis','release')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_questions_instrument_position_idx ON public.research_questions(instrument_id, position);
CREATE INDEX research_frame_units_snapshot_stratum_idx ON public.research_frame_units(frame_snapshot_id, stratum_id);
CREATE INDEX research_contact_points_frame_unit_idx ON public.research_contact_points(frame_unit_id);
CREATE INDEX research_sample_units_draw_stratum_idx ON public.research_sample_units(sample_draw_id, stratum_id);
CREATE INDEX research_invites_study_status_idx ON public.research_invites(study_id, status);
CREATE INDEX research_invite_events_invite_time_idx ON public.research_invite_events(invite_id, occurred_at);
CREATE INDEX research_responses_study_status_idx ON public.research_responses(study_id, status);
CREATE INDEX research_answers_response_idx ON public.research_answers(response_id);
CREATE INDEX research_study_jobs_claim_idx ON public.research_study_jobs(status, available_at, created_at);

ALTER TABLE public.research_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_strata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_contact_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invite_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_response_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_release_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_study_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_invites, public.research_invite_events, public.research_responses,
      public.research_consents, public.research_answers, public.research_experiment_assignments,
      public.research_response_scores, public.research_weights, public.research_analysis_runs,
      public.research_release_snapshots, public.research_study_jobs
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_invites, public.research_invite_events, public.research_responses,
      public.research_consents, public.research_answers, public.research_experiment_assignments,
      public.research_response_scores, public.research_weights, public.research_analysis_runs,
      public.research_release_snapshots, public.research_study_jobs
    FROM authenticated;
  END IF;
END $;

-- The browser/Data API roles remain denied. Server-side research operations are
-- available only to the credential-bound platform runtime role and still pass
-- through RLS. This mirrors the repository's existing platform authorization
-- model instead of relying on table ownership or service_role.
DO $
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'research_studies','research_instruments','research_questions',
    'research_frame_snapshots','research_strata','research_frame_units',
    'research_contact_points','research_sample_draws','research_sample_units',
    'research_invites','research_invite_events','research_responses',
    'research_consents','research_answers','research_experiment_assignments',
    'research_response_scores','research_weights','research_analysis_runs',
    'research_release_snapshots','research_study_jobs'
  ]
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO bls_platform_runtime',
      table_name
    );
    policy_name := table_name || '_platform_runtime';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO bls_platform_runtime USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()))',
      policy_name,
      table_name
    );
  END LOOP;

  GRANT USAGE, SELECT ON SEQUENCE public.research_invite_events_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_consents_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_answers_id_seq TO bls_platform_runtime;
END $;

CREATE OR REPLACE FUNCTION public.research_guard_answer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE response_status text;
BEGIN
  SELECT status INTO response_status
  FROM public.research_responses
  WHERE id = COALESCE(NEW.response_id, OLD.response_id);

  IF response_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'research response is not mutable in status %', response_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_answers_mutable_only_while_in_progress
BEFORE INSERT OR UPDATE OR DELETE ON public.research_answers
FOR EACH ROW EXECUTE FUNCTION public.research_guard_answer_mutation();

CREATE TRIGGER research_invite_events_append_only
BEFORE UPDATE OR DELETE ON public.research_invite_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE TRIGGER research_consents_append_only
BEFORE UPDATE OR DELETE ON public.research_consents
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_locked_instrument()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE instrument_status text;
BEGIN
  SELECT status INTO instrument_status
  FROM public.research_instruments
  WHERE id = COALESCE(NEW.instrument_id, OLD.instrument_id);

  IF instrument_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'research instrument is locked in status %', instrument_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_questions_draft_instrument_only
BEFORE INSERT OR UPDATE OR DELETE ON public.research_questions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_locked_instrument();

INSERT INTO public.research_studies (
  id, slug, title, subtitle, sponsor, population_definition, methodology_summary, status, default_locale
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000001',
  'greek-retail-2026',
  'Ελληνικό Λιανεμπόριο 2026',
  'Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή',
  'KONTA MOY',
  'Ενεργές ελληνικές εμπορικές επιχειρήσεις εντός των προκαθορισμένων ΚΑΔ της μελέτης. Η επιστημονική δειγματοληψία γίνεται από παγωμένο πλαίσιο πληθυσμού και όχι μόνο από επιχειρήσεις με διαθέσιμο email.',
  'Επαναλήψιμη μελέτη με παγωμένο πλαίσιο πληθυσμού, στρωματοποιημένη πιθανοκρατική δειγματοληψία όπου είναι εφικτή, versioned questionnaire, ξεχωριστή συγκατάθεση, καταγραφή non-response και αναπαραγώγιμη στάθμιση/ανάλυση.',
  'draft',
  'el-GR'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.research_instruments (
  id, study_id, version, content_sha256, status, consent_statement_version
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000002',
  '1b1bc971-705a-4b97-92c5-202600000001',
  '0.2.0',
  '2dd54f588e65892cd3b8bc8b073affdd95165c25bf8574c6f88db99fe5019f81',
  'draft',
  '2026-10-04-v1'
) ON CONFLICT (study_id, version) DO NOTHING;

INSERT INTO public.research_questions
  (instrument_id, code, section_code, position, question_type, prompt_el, help_el, required, analysis_key, config)
VALUES
('1b1bc971-705a-4b97-92c5-202600000002','Q01','A',1,'single','Ποιος είναι ο ρόλος σας στην επιχείρηση;',NULL,true,'respondent_role',
 '{"options":[["owner","Ιδιοκτήτης / συνιδιοκτήτης"],["management","Διοίκηση / υπεύθυνος καταστήματος"],["ecommerce","E-commerce / marketing / πωλήσεις"],["employee","Εργαζόμενος με γνώση της λειτουργίας της επιχείρησης"],["other","Άλλος ρόλος"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q02','A',2,'single','Πόσα άτομα εργάζονται σήμερα στην επιχείρηση, μαζί με τους ιδιοκτήτες;',NULL,true,'employee_band',
 '{"options":[["1","1"],["2_4","2–4"],["5_9","5–9"],["10_19","10–19"],["20_49","20–49"],["50_plus","50 ή περισσότερα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q03','A',3,'multi','Μέσω ποιων καναλιών πραγματοποιεί σήμερα πωλήσεις η επιχείρηση;','Επιλέξτε όσα ισχύουν.',true,'sales_channels',
 '{"options":[["physical","Φυσικό κατάστημα"],["own_eshop","Δικό της e-shop"],["marketplace","Marketplace / πλατφόρμα τρίτου"],["social","Social media / μηνύματα"],["phone","Τηλεφωνικές παραγγελίες"],["b2b","B2B / χονδρική"],["other","Άλλο"],["none","Δεν πραγματοποιεί αυτή τη στιγμή πωλήσεις"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q04','A',4,'single','Περίπου τι ποσοστό των λιανικών πωλήσεών σας πραγματοποιείται μέσω ψηφιακών καναλιών;',NULL,true,'digital_sales_share',
 '{"options":[["0","0%"],["1_10","1–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω / δεν μπορώ να εκτιμήσω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q05','B',5,'matrix','Σε ποιο βαθμό διαθέτει σήμερα η επιχείρηση τις παρακάτω δυνατότητες;',NULL,true,'digital_capabilities',
 '{"scale":[["no","Όχι"],["partial","Μερικώς"],["yes","Ναι, πλήρως"]],"items":[["catalog","Ψηφιακό και οργανωμένο κατάλογο προϊόντων"],["stock","Ψηφιακή παρακολούθηση αποθέματος"],["stock_sync","Αυτόματη ή συστηματική ενημέρωση αποθέματος"],["payments","Ηλεκτρονικές πληρωμές"],["orders","Κεντρική διαχείριση παραγγελιών"],["tracking","Οργάνωση αποστολών / tracking"],["tax","Ηλεκτρονική τιμολόγηση / φορολογικές διαδικασίες"],["reporting","Στοιχεία και αναφορές για την απόδοση των πωλήσεων"],["crm","Οργανωμένη διαχείριση πελατών / επαναλαμβανόμενων πελατών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q06','B',6,'single','Πόσο συχνά ενημερώνονται ψηφιακά τιμές, προϊόντα και αποθέματα;',NULL,true,'catalog_update_frequency',
 '{"options":[["realtime","Αυτόματα ή σχεδόν σε πραγματικό χρόνο"],["daily","Καθημερινά"],["few_week","Μερικές φορές την εβδομάδα"],["weekly","Περίπου εβδομαδιαία"],["rarely","Λιγότερο συχνά"],["on_demand","Μόνο όταν υπάρχει ανάγκη"],["none","Δεν υπάρχει οργανωμένο ψηφιακό σύστημα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q07','C',7,'matrix','Πόσο δύσκολο είναι για την επιχείρησή σας καθένα από τα παρακάτω;',NULL,true,'operational_friction',
 '{"scale":[["1","1 · Καθόλου δύσκολο"],["2","2 · Λίγο"],["3","3 · Μέτρια"],["4","4 · Πολύ"],["5","5 · Εξαιρετικά δύσκολο"],["na","Δεν αφορά την επιχείρησή μου"]],"items":[["catalog","Δημιουργία και συντήρηση καταλόγου προϊόντων"],["content","Φωτογραφίες και περιγραφές προϊόντων"],["stock","Έλεγχος και συγχρονισμός αποθέματος"],["pricing","Τιμές και προσφορές"],["tech","Τεχνική λειτουργία e-shop / ψηφιακών εργαλείων"],["acquisition","Εύρεση νέων πελατών / διαφήμιση"],["payments","Ηλεκτρονικές πληρωμές"],["logistics","Αποστολές και logistics"],["returns","Επιστροφές / αλλαγές προϊόντων"],["admin","Τιμολόγηση και διοικητικές διαδικασίες"],["platform_cost","Προμήθειες και κόστη τρίτων πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q08','C',8,'multi','Ποια τρία από αυτά αποτελούν σήμερα τα μεγαλύτερα εμπόδια στην ανάπτυξη της επιχείρησής σας;','Επιλέξτε έως 3.',true,'top_growth_barriers',
 '{"max":3,"options":[["catalog","Κατάλογος προϊόντων"],["content","Φωτογραφίες / περιγραφές"],["stock","Απόθεμα"],["pricing","Τιμές / προσφορές"],["tech","Τεχνική λειτουργία"],["acquisition","Εύρεση νέων πελατών"],["payments","Πληρωμές"],["logistics","Logistics"],["returns","Επιστροφές"],["admin","Διοικητικές διαδικασίες"],["platform_cost","Κόστη πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q09','D',9,'multi','Από πού προέρχονται σήμερα κυρίως οι νέοι πελάτες σας;','Επιλέξτε έως 3 κύριες πηγές.',true,'customer_acquisition_sources',
 '{"max":3,"options":[["footfall","Φυσική διέλευση / τοποθεσία καταστήματος"],["word_of_mouth","Συστάσεις / word of mouth"],["google","Google / αναζητήσεις"],["organic_social","Social media χωρίς πληρωμένη διαφήμιση"],["paid_ads","Πληρωμένη online διαφήμιση"],["marketplace","Marketplace"],["own_eshop","Δικό μας e-shop"],["local","Τοπικές δράσεις / εκδηλώσεις / συνεργασίες"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q10','D',10,'scale','Πόσο δύσκολο είναι σήμερα να αποκτήσετε έναν νέο πελάτη σε σχέση με πριν από 2–3 χρόνια;','0 = πολύ ευκολότερο · 5 = περίπου το ίδιο · 10 = πολύ δυσκολότερο',true,'acquisition_difficulty_change',
 '{"min":0,"max":10,"step":1}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q11','D',11,'single','Περίπου τι ποσοστό των πελατών σας βρίσκεται στην ίδια τοπική περιοχή με την επιχείρηση;',NULL,true,'local_customer_share',
 '{"options":[["0_10","0–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q12','D',12,'scale','Πόσο σημαντικό θα ήταν για την επιχείρησή σας να μπορεί ένας καταναλωτής που βρίσκεται κοντά σας να ανακαλύψει εύκολα online ότι διαθέτετε το προϊόν που ψάχνει;',NULL,true,'local_product_discovery_importance',
 '{"min":1,"max":5,"step":1,"labels":{"1":"Καθόλου σημαντικό","5":"Εξαιρετικά σημαντικό"}}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q13','E',13,'single','Ποια είναι η εμπειρία σας με marketplaces ή άλλες πλατφόρμες πώλησης;',NULL,true,'marketplace_experience',
 '{"options":[["current","Χρησιμοποιούμε σήμερα μία ή περισσότερες"],["past","Χρησιμοποιούσαμε στο παρελθόν"],["considering","Το εξετάζουμε"],["never","Δεν έχουμε χρησιμοποιήσει ποτέ"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q14','E',14,'matrix','Πόσο σημαντικοί είναι οι παρακάτω παράγοντες όταν αξιολογείτε μια marketplace πλατφόρμα;',NULL,true,'marketplace_factors',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["reach","Πρόσβαση σε περισσότερους πελάτες"],["national","Προβολή σε όλη την Ελλάδα"],["local","Προβολή σε πελάτες της τοπικής περιοχής"],["commission","Κόστος / προμήθεια ανά πώληση"],["subscription","Σταθερή μηνιαία συνδρομή"],["catalog_time","Χρόνος διαχείρισης καταλόγου"],["customer_control","Έλεγχος της σχέσης με τον πελάτη"],["pricing_control","Έλεγχος της τιμολογιακής πολιτικής"],["payments","Διαχείριση πληρωμών"],["shipping","Διαχείριση αποστολών"],["returns","Διαχείριση επιστροφών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q15','E',15,'matrix','Πόσο σημαντικά θα ήταν τα παρακάτω σε μια ψηφιακή εμπορική πλατφόρμα;',NULL,true,'platform_feature_importance',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["low_commission","Χαμηλή προμήθεια"],["predictable_cost","Προβλέψιμο σταθερό κόστος"],["customer_relationship","Δυνατότητα διατήρησης της σχέσης με τον πελάτη"],["single_listing","Καταχώρηση προϊόντος μία φορά"],["stock_sync","Αυτόματος συγχρονισμός αποθέματος"],["pickup","Τοπική παραλαβή από κατάστημα"],["national_shipping","Πανελλαδικές αποστολές"],["checkout","Κοινή διαδικασία πληρωμής"],["returns","Υποστήριξη επιστροφών"],["marketing","Προβολή / marketing των προϊόντων"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q16','F',16,'multi','Σε ποιους τομείς σχεδιάζει η επιχείρηση να επενδύσει μέσα στους επόμενους 12 μήνες;','Επιλέξτε όσα ισχύουν.',true,'investment_intentions',
 '{"options":[["eshop","E-shop"],["ads","Ψηφιακή διαφήμιση"],["social","Social media"],["marketplace","Marketplace"],["erp","ERP / απόθεμα / επιχειρησιακό λογισμικό"],["content","Φωτογραφίες / περιεχόμενο προϊόντων"],["logistics","Logistics / αποστολές"],["physical","Φυσικό κατάστημα"],["training","Εκπαίδευση προσωπικού"],["none","Δεν σχεδιάζεται κάποια σημαντική επένδυση"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q17','F',17,'single','Πώς περιμένετε να εξελιχθούν οι πωλήσεις της επιχείρησής σας τους επόμενους 12 μήνες;',NULL,true,'sales_outlook',
 '{"options":[["down_large","Σημαντική μείωση"],["down_small","Μικρή μείωση"],["stable","Περίπου σταθερές"],["up_small","Μικρή αύξηση"],["up_large","Σημαντική αύξηση"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q18','F',18,'text','Αν μπορούσατε να εξαφανίσετε ένα μόνο εμπόδιο από την καθημερινή λειτουργία ή ανάπτυξη της επιχείρησής σας, ποιο θα ήταν;',NULL,false,'open_barrier',
 '{"maxLength":1500}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','EXP01','X',19,'experiment','Ποια από τις δύο υποθετικές ψηφιακές εμπορικές υπηρεσίες θα προτιμούσατε;','Θα εμφανιστούν 3 ανεξάρτητες συγκρίσεις. Οι υπηρεσίες είναι ερευνητικά σενάρια, όχι πραγματικές εμπορικές προσφορές.',false,'platform_choice_experiment',
 '{"tasks":3,"choice":["a","b","none"],"attributes":{"monthly_fee_eur":[0,29,69,129],"commission_pct":[0,3,7,12],"reach":["local","national","local_national"],"catalog":["manual","single_import","automatic_sync"],"customer_relationship":["platform_only","merchant_access"],"stock_sync":["none","daily","realtime"],"operations":["listing_only","payments","payments_shipping_returns"]}}'::jsonb)
ON CONFLICT (instrument_id, code) DO NOTHING;

COMMIT;
),
  purpose text NOT NULL DEFAULT 'research_invitation',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  UNIQUE (study_id, version, channel)
);

CREATE TABLE public.research_invite_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  sample_draw_id uuid NOT NULL REFERENCES public.research_sample_draws(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  recruitment_template_id uuid REFERENCES public.research_recruitment_templates(id) ON DELETE RESTRICT,
  label text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','postal','manual','other')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','sending','complete','cancelled')),
  planned_count integer NOT NULL DEFAULT 0 CHECK (planned_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE public.research_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  sample_unit_id uuid REFERENCES public.research_sample_units(id) ON DELETE SET NULL,
  contact_point_id uuid REFERENCES public.research_contact_points(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','postal','manual','other')),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','sent','opened','started','completed','expired','suppressed')),
  sent_at timestamptz,
  first_opened_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_invite_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_id uuid NOT NULL REFERENCES public.research_invites(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('created','sent','delivered','opened','started','saved','completed','bounced','suppressed','expired')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.research_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  instrument_id uuid NOT NULL REFERENCES public.research_instruments(id) ON DELETE RESTRICT,
  invite_id uuid NOT NULL UNIQUE REFERENCES public.research_invites(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','withdrawn','excluded')),
  locale text NOT NULL DEFAULT 'el-GR',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_saved_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  withdrawn_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  quality_flags jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.research_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  consent_kind text NOT NULL
    CHECK (consent_kind IN ('research_participation','results_notification','thank_you_code','marketing')),
  statement_version text NOT NULL,
  granted boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'survey_ui'
);
CREATE INDEX research_consents_response_kind_time_idx
  ON public.research_consents(response_id, consent_kind, occurred_at DESC, id DESC);

CREATE TABLE public.research_answers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.research_questions(id) ON DELETE RESTRICT,
  answer jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, question_id)
);

CREATE TABLE public.research_experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  experiment_code text NOT NULL,
  task_number integer NOT NULL CHECK (task_number > 0),
  randomization_seed text NOT NULL,
  alternative_a jsonb NOT NULL,
  alternative_b jsonb NOT NULL,
  selected text CHECK (selected IN ('a','b','none')),
  answered_at timestamptz,
  UNIQUE (response_id, experiment_code, task_number)
);

CREATE TABLE public.research_response_scores (
  response_id uuid PRIMARY KEY REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  scoring_version text NOT NULL,
  digital_readiness_score numeric(6,2) CHECK (digital_readiness_score BETWEEN 0 AND 100),
  friction_overall_score numeric(6,2) CHECK (friction_overall_score BETWEEN 0 AND 100),
  friction_dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  version text NOT NULL,
  base_weight numeric(18,8) NOT NULL DEFAULT 1 CHECK (base_weight > 0),
  nonresponse_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (nonresponse_adjustment > 0),
  calibration_adjustment numeric(18,8) NOT NULL DEFAULT 1 CHECK (calibration_adjustment > 0),
  final_weight numeric(18,8) NOT NULL CHECK (final_weight > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (response_id, version)
);

CREATE TABLE public.research_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  label text NOT NULL,
  code_version text NOT NULL,
  instrument_version text NOT NULL,
  weight_version text,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  dataset_sha256 text CHECK (dataset_sha256 IS NULL OR dataset_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_release_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  analysis_run_id uuid NOT NULL REFERENCES public.research_analysis_runs(id) ON DELETE RESTRICT,
  release_version text NOT NULL,
  methodology_json jsonb NOT NULL,
  dataset_sha256 text NOT NULL CHECK (dataset_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[a-f0-9]{64}$'),
  public_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, release_version)
);

CREATE TABLE public.research_study_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE CASCADE,
  job_type text NOT NULL
    CHECK (job_type IN ('frame_snapshot','contact_enrichment','sample_draw','invite_batch','weighting','analysis','release')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_questions_instrument_position_idx ON public.research_questions(instrument_id, position);
CREATE INDEX research_frame_units_snapshot_stratum_idx ON public.research_frame_units(frame_snapshot_id, stratum_id);
CREATE INDEX research_contact_points_frame_unit_idx ON public.research_contact_points(frame_unit_id);
CREATE INDEX research_sample_units_draw_stratum_idx ON public.research_sample_units(sample_draw_id, stratum_id);
CREATE INDEX research_invites_study_status_idx ON public.research_invites(study_id, status);
CREATE INDEX research_invite_events_invite_time_idx ON public.research_invite_events(invite_id, occurred_at);
CREATE INDEX research_responses_study_status_idx ON public.research_responses(study_id, status);
CREATE INDEX research_answers_response_idx ON public.research_answers(response_id);
CREATE INDEX research_study_jobs_claim_idx ON public.research_study_jobs(status, available_at, created_at);

ALTER TABLE public.research_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_strata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_frame_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_contact_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invite_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_response_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_release_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_study_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_invites, public.research_invite_events, public.research_responses,
      public.research_consents, public.research_answers, public.research_experiment_assignments,
      public.research_response_scores, public.research_weights, public.research_analysis_runs,
      public.research_release_snapshots, public.research_study_jobs
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_studies, public.research_instruments, public.research_questions,
      public.research_frame_snapshots, public.research_strata, public.research_frame_units,
      public.research_contact_points, public.research_sample_draws, public.research_sample_units,
      public.research_invites, public.research_invite_events, public.research_responses,
      public.research_consents, public.research_answers, public.research_experiment_assignments,
      public.research_response_scores, public.research_weights, public.research_analysis_runs,
      public.research_release_snapshots, public.research_study_jobs
    FROM authenticated;
  END IF;
END $;

-- The browser/Data API roles remain denied. Server-side research operations are
-- available only to the credential-bound platform runtime role and still pass
-- through RLS. This mirrors the repository's existing platform authorization
-- model instead of relying on table ownership or service_role.
DO $
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'research_studies','research_instruments','research_questions',
    'research_frame_snapshots','research_strata','research_frame_units',
    'research_contact_points','research_sample_draws','research_sample_units',
    'research_invites','research_invite_events','research_responses',
    'research_consents','research_answers','research_experiment_assignments',
    'research_response_scores','research_weights','research_analysis_runs',
    'research_release_snapshots','research_study_jobs'
  ]
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO bls_platform_runtime',
      table_name
    );
    policy_name := table_name || '_platform_runtime';
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO bls_platform_runtime USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()))',
      policy_name,
      table_name
    );
  END LOOP;

  GRANT USAGE, SELECT ON SEQUENCE public.research_invite_events_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_consents_id_seq TO bls_platform_runtime;
  GRANT USAGE, SELECT ON SEQUENCE public.research_answers_id_seq TO bls_platform_runtime;
END $;

CREATE OR REPLACE FUNCTION public.research_guard_answer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE response_status text;
BEGIN
  SELECT status INTO response_status
  FROM public.research_responses
  WHERE id = COALESCE(NEW.response_id, OLD.response_id);

  IF response_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'research response is not mutable in status %', response_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_answers_mutable_only_while_in_progress
BEFORE INSERT OR UPDATE OR DELETE ON public.research_answers
FOR EACH ROW EXECUTE FUNCTION public.research_guard_answer_mutation();

CREATE TRIGGER research_invite_events_append_only
BEFORE UPDATE OR DELETE ON public.research_invite_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE TRIGGER research_consents_append_only
BEFORE UPDATE OR DELETE ON public.research_consents
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE OR REPLACE FUNCTION public.research_guard_locked_instrument()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE instrument_status text;
BEGIN
  SELECT status INTO instrument_status
  FROM public.research_instruments
  WHERE id = COALESCE(NEW.instrument_id, OLD.instrument_id);

  IF instrument_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'research instrument is locked in status %', instrument_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER research_questions_draft_instrument_only
BEFORE INSERT OR UPDATE OR DELETE ON public.research_questions
FOR EACH ROW EXECUTE FUNCTION public.research_guard_locked_instrument();

INSERT INTO public.research_studies (
  id, slug, title, subtitle, sponsor, population_definition, methodology_summary, status, default_locale
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000001',
  'greek-retail-2026',
  'Ελληνικό Λιανεμπόριο 2026',
  'Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή',
  'KONTA MOY',
  'Ενεργές ελληνικές εμπορικές επιχειρήσεις εντός των προκαθορισμένων ΚΑΔ της μελέτης. Η επιστημονική δειγματοληψία γίνεται από παγωμένο πλαίσιο πληθυσμού και όχι μόνο από επιχειρήσεις με διαθέσιμο email.',
  'Επαναλήψιμη μελέτη με παγωμένο πλαίσιο πληθυσμού, στρωματοποιημένη πιθανοκρατική δειγματοληψία όπου είναι εφικτή, versioned questionnaire, ξεχωριστή συγκατάθεση, καταγραφή non-response και αναπαραγώγιμη στάθμιση/ανάλυση.',
  'draft',
  'el-GR'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.research_instruments (
  id, study_id, version, content_sha256, status, consent_statement_version
) VALUES (
  '1b1bc971-705a-4b97-92c5-202600000002',
  '1b1bc971-705a-4b97-92c5-202600000001',
  '0.2.0',
  '2dd54f588e65892cd3b8bc8b073affdd95165c25bf8574c6f88db99fe5019f81',
  'draft',
  '2026-10-04-v1'
) ON CONFLICT (study_id, version) DO NOTHING;

INSERT INTO public.research_questions
  (instrument_id, code, section_code, position, question_type, prompt_el, help_el, required, analysis_key, config)
VALUES
('1b1bc971-705a-4b97-92c5-202600000002','Q01','A',1,'single','Ποιος είναι ο ρόλος σας στην επιχείρηση;',NULL,true,'respondent_role',
 '{"options":[["owner","Ιδιοκτήτης / συνιδιοκτήτης"],["management","Διοίκηση / υπεύθυνος καταστήματος"],["ecommerce","E-commerce / marketing / πωλήσεις"],["employee","Εργαζόμενος με γνώση της λειτουργίας της επιχείρησης"],["other","Άλλος ρόλος"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q02','A',2,'single','Πόσα άτομα εργάζονται σήμερα στην επιχείρηση, μαζί με τους ιδιοκτήτες;',NULL,true,'employee_band',
 '{"options":[["1","1"],["2_4","2–4"],["5_9","5–9"],["10_19","10–19"],["20_49","20–49"],["50_plus","50 ή περισσότερα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q03','A',3,'multi','Μέσω ποιων καναλιών πραγματοποιεί σήμερα πωλήσεις η επιχείρηση;','Επιλέξτε όσα ισχύουν.',true,'sales_channels',
 '{"options":[["physical","Φυσικό κατάστημα"],["own_eshop","Δικό της e-shop"],["marketplace","Marketplace / πλατφόρμα τρίτου"],["social","Social media / μηνύματα"],["phone","Τηλεφωνικές παραγγελίες"],["b2b","B2B / χονδρική"],["other","Άλλο"],["none","Δεν πραγματοποιεί αυτή τη στιγμή πωλήσεις"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q04','A',4,'single','Περίπου τι ποσοστό των λιανικών πωλήσεών σας πραγματοποιείται μέσω ψηφιακών καναλιών;',NULL,true,'digital_sales_share',
 '{"options":[["0","0%"],["1_10","1–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω / δεν μπορώ να εκτιμήσω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q05','B',5,'matrix','Σε ποιο βαθμό διαθέτει σήμερα η επιχείρηση τις παρακάτω δυνατότητες;',NULL,true,'digital_capabilities',
 '{"scale":[["no","Όχι"],["partial","Μερικώς"],["yes","Ναι, πλήρως"]],"items":[["catalog","Ψηφιακό και οργανωμένο κατάλογο προϊόντων"],["stock","Ψηφιακή παρακολούθηση αποθέματος"],["stock_sync","Αυτόματη ή συστηματική ενημέρωση αποθέματος"],["payments","Ηλεκτρονικές πληρωμές"],["orders","Κεντρική διαχείριση παραγγελιών"],["tracking","Οργάνωση αποστολών / tracking"],["tax","Ηλεκτρονική τιμολόγηση / φορολογικές διαδικασίες"],["reporting","Στοιχεία και αναφορές για την απόδοση των πωλήσεων"],["crm","Οργανωμένη διαχείριση πελατών / επαναλαμβανόμενων πελατών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q06','B',6,'single','Πόσο συχνά ενημερώνονται ψηφιακά τιμές, προϊόντα και αποθέματα;',NULL,true,'catalog_update_frequency',
 '{"options":[["realtime","Αυτόματα ή σχεδόν σε πραγματικό χρόνο"],["daily","Καθημερινά"],["few_week","Μερικές φορές την εβδομάδα"],["weekly","Περίπου εβδομαδιαία"],["rarely","Λιγότερο συχνά"],["on_demand","Μόνο όταν υπάρχει ανάγκη"],["none","Δεν υπάρχει οργανωμένο ψηφιακό σύστημα"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q07','C',7,'matrix','Πόσο δύσκολο είναι για την επιχείρησή σας καθένα από τα παρακάτω;',NULL,true,'operational_friction',
 '{"scale":[["1","1 · Καθόλου δύσκολο"],["2","2 · Λίγο"],["3","3 · Μέτρια"],["4","4 · Πολύ"],["5","5 · Εξαιρετικά δύσκολο"],["na","Δεν αφορά την επιχείρησή μου"]],"items":[["catalog","Δημιουργία και συντήρηση καταλόγου προϊόντων"],["content","Φωτογραφίες και περιγραφές προϊόντων"],["stock","Έλεγχος και συγχρονισμός αποθέματος"],["pricing","Τιμές και προσφορές"],["tech","Τεχνική λειτουργία e-shop / ψηφιακών εργαλείων"],["acquisition","Εύρεση νέων πελατών / διαφήμιση"],["payments","Ηλεκτρονικές πληρωμές"],["logistics","Αποστολές και logistics"],["returns","Επιστροφές / αλλαγές προϊόντων"],["admin","Τιμολόγηση και διοικητικές διαδικασίες"],["platform_cost","Προμήθειες και κόστη τρίτων πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q08','C',8,'multi','Ποια τρία από αυτά αποτελούν σήμερα τα μεγαλύτερα εμπόδια στην ανάπτυξη της επιχείρησής σας;','Επιλέξτε έως 3.',true,'top_growth_barriers',
 '{"max":3,"options":[["catalog","Κατάλογος προϊόντων"],["content","Φωτογραφίες / περιγραφές"],["stock","Απόθεμα"],["pricing","Τιμές / προσφορές"],["tech","Τεχνική λειτουργία"],["acquisition","Εύρεση νέων πελατών"],["payments","Πληρωμές"],["logistics","Logistics"],["returns","Επιστροφές"],["admin","Διοικητικές διαδικασίες"],["platform_cost","Κόστη πλατφορμών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q09','D',9,'multi','Από πού προέρχονται σήμερα κυρίως οι νέοι πελάτες σας;','Επιλέξτε έως 3 κύριες πηγές.',true,'customer_acquisition_sources',
 '{"max":3,"options":[["footfall","Φυσική διέλευση / τοποθεσία καταστήματος"],["word_of_mouth","Συστάσεις / word of mouth"],["google","Google / αναζητήσεις"],["organic_social","Social media χωρίς πληρωμένη διαφήμιση"],["paid_ads","Πληρωμένη online διαφήμιση"],["marketplace","Marketplace"],["own_eshop","Δικό μας e-shop"],["local","Τοπικές δράσεις / εκδηλώσεις / συνεργασίες"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q10','D',10,'scale','Πόσο δύσκολο είναι σήμερα να αποκτήσετε έναν νέο πελάτη σε σχέση με πριν από 2–3 χρόνια;','0 = πολύ ευκολότερο · 5 = περίπου το ίδιο · 10 = πολύ δυσκολότερο',true,'acquisition_difficulty_change',
 '{"min":0,"max":10,"step":1}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q11','D',11,'single','Περίπου τι ποσοστό των πελατών σας βρίσκεται στην ίδια τοπική περιοχή με την επιχείρηση;',NULL,true,'local_customer_share',
 '{"options":[["0_10","0–10%"],["11_25","11–25%"],["26_50","26–50%"],["51_75","51–75%"],["76_100","76–100%"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q12','D',12,'scale','Πόσο σημαντικό θα ήταν για την επιχείρησή σας να μπορεί ένας καταναλωτής που βρίσκεται κοντά σας να ανακαλύψει εύκολα online ότι διαθέτετε το προϊόν που ψάχνει;',NULL,true,'local_product_discovery_importance',
 '{"min":1,"max":5,"step":1,"labels":{"1":"Καθόλου σημαντικό","5":"Εξαιρετικά σημαντικό"}}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q13','E',13,'single','Ποια είναι η εμπειρία σας με marketplaces ή άλλες πλατφόρμες πώλησης;',NULL,true,'marketplace_experience',
 '{"options":[["current","Χρησιμοποιούμε σήμερα μία ή περισσότερες"],["past","Χρησιμοποιούσαμε στο παρελθόν"],["considering","Το εξετάζουμε"],["never","Δεν έχουμε χρησιμοποιήσει ποτέ"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q14','E',14,'matrix','Πόσο σημαντικοί είναι οι παρακάτω παράγοντες όταν αξιολογείτε μια marketplace πλατφόρμα;',NULL,true,'marketplace_factors',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["reach","Πρόσβαση σε περισσότερους πελάτες"],["national","Προβολή σε όλη την Ελλάδα"],["local","Προβολή σε πελάτες της τοπικής περιοχής"],["commission","Κόστος / προμήθεια ανά πώληση"],["subscription","Σταθερή μηνιαία συνδρομή"],["catalog_time","Χρόνος διαχείρισης καταλόγου"],["customer_control","Έλεγχος της σχέσης με τον πελάτη"],["pricing_control","Έλεγχος της τιμολογιακής πολιτικής"],["payments","Διαχείριση πληρωμών"],["shipping","Διαχείριση αποστολών"],["returns","Διαχείριση επιστροφών"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q15','E',15,'matrix','Πόσο σημαντικά θα ήταν τα παρακάτω σε μια ψηφιακή εμπορική πλατφόρμα;',NULL,true,'platform_feature_importance',
 '{"scale":[["1","1"],["2","2"],["3","3"],["4","4"],["5","5"]],"items":[["low_commission","Χαμηλή προμήθεια"],["predictable_cost","Προβλέψιμο σταθερό κόστος"],["customer_relationship","Δυνατότητα διατήρησης της σχέσης με τον πελάτη"],["single_listing","Καταχώρηση προϊόντος μία φορά"],["stock_sync","Αυτόματος συγχρονισμός αποθέματος"],["pickup","Τοπική παραλαβή από κατάστημα"],["national_shipping","Πανελλαδικές αποστολές"],["checkout","Κοινή διαδικασία πληρωμής"],["returns","Υποστήριξη επιστροφών"],["marketing","Προβολή / marketing των προϊόντων"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q16','F',16,'multi','Σε ποιους τομείς σχεδιάζει η επιχείρηση να επενδύσει μέσα στους επόμενους 12 μήνες;','Επιλέξτε όσα ισχύουν.',true,'investment_intentions',
 '{"options":[["eshop","E-shop"],["ads","Ψηφιακή διαφήμιση"],["social","Social media"],["marketplace","Marketplace"],["erp","ERP / απόθεμα / επιχειρησιακό λογισμικό"],["content","Φωτογραφίες / περιεχόμενο προϊόντων"],["logistics","Logistics / αποστολές"],["physical","Φυσικό κατάστημα"],["training","Εκπαίδευση προσωπικού"],["none","Δεν σχεδιάζεται κάποια σημαντική επένδυση"],["other","Άλλο"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q17','F',17,'single','Πώς περιμένετε να εξελιχθούν οι πωλήσεις της επιχείρησής σας τους επόμενους 12 μήνες;',NULL,true,'sales_outlook',
 '{"options":[["down_large","Σημαντική μείωση"],["down_small","Μικρή μείωση"],["stable","Περίπου σταθερές"],["up_small","Μικρή αύξηση"],["up_large","Σημαντική αύξηση"],["unknown","Δεν γνωρίζω"]]}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','Q18','F',18,'text','Αν μπορούσατε να εξαφανίσετε ένα μόνο εμπόδιο από την καθημερινή λειτουργία ή ανάπτυξη της επιχείρησής σας, ποιο θα ήταν;',NULL,false,'open_barrier',
 '{"maxLength":1500}'::jsonb),
('1b1bc971-705a-4b97-92c5-202600000002','EXP01','X',19,'experiment','Ποια από τις δύο υποθετικές ψηφιακές εμπορικές υπηρεσίες θα προτιμούσατε;','Θα εμφανιστούν 3 ανεξάρτητες συγκρίσεις. Οι υπηρεσίες είναι ερευνητικά σενάρια, όχι πραγματικές εμπορικές προσφορές.',false,'platform_choice_experiment',
 '{"tasks":3,"choice":["a","b","none"],"attributes":{"monthly_fee_eur":[0,29,69,129],"commission_pct":[0,3,7,12],"reach":["local","national","local_national"],"catalog":["manual","single_import","automatic_sync"],"customer_relationship":["platform_only","merchant_access"],"stock_sync":["none","daily","realtime"],"operations":["listing_only","payments","payments_shipping_returns"]}}'::jsonb)
ON CONFLICT (instrument_id, code) DO NOTHING;

COMMIT;

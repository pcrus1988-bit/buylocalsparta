-- KONTA MOY — restricted research identity vault and linkage-destruction lifecycle.
-- Schema 0428 removes raw contact values from the public research schema,
-- preserves only operational/hash metadata there, and creates the evidence
-- structures required to irreversibly sever response/contact/sample linkage
-- after the governed retention window.

BEGIN;

CREATE SCHEMA IF NOT EXISTS research_private;
REVOKE ALL ON SCHEMA research_private FROM PUBLIC;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON SCHEMA research_private FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON SCHEMA research_private FROM authenticated;
  END IF;
END;
$research$;

GRANT USAGE ON SCHEMA research_private TO bls_platform_runtime;

CREATE TABLE research_private.contact_vault (
  contact_point_id uuid PRIMARY KEY
    REFERENCES public.research_contact_points(id) ON DELETE CASCADE,
  contact_value text NOT NULL CHECK (char_length(contact_value) BETWEEN 1 AND 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO research_private.contact_vault (
  contact_point_id,contact_value,created_at,updated_at
)
SELECT id,contact_value,created_at,created_at
FROM public.research_contact_points
WHERE contact_value <> ''
ON CONFLICT (contact_point_id) DO NOTHING;

ALTER TABLE public.research_contact_points
  DROP COLUMN contact_value;

ALTER TABLE public.research_invite_messages
  ALTER COLUMN contact_point_id DROP NOT NULL,
  DROP CONSTRAINT research_invite_messages_contact_point_id_fkey,
  ADD CONSTRAINT research_invite_messages_contact_point_id_fkey
    FOREIGN KEY (contact_point_id)
    REFERENCES public.research_contact_points(id)
    ON DELETE SET NULL;

ALTER TABLE public.research_participant_deliveries
  ALTER COLUMN contact_point_id DROP NOT NULL,
  DROP CONSTRAINT research_participant_deliveries_contact_point_id_fkey,
  ADD CONSTRAINT research_participant_deliveries_contact_point_id_fkey
    FOREIGN KEY (contact_point_id)
    REFERENCES public.research_contact_points(id)
    ON DELETE SET NULL;

CREATE VIEW research_private.contact_points_with_value
WITH (security_invoker=true, security_barrier=true)
AS
SELECT
  cp.id,
  cp.frame_unit_id,
  cp.contact_type,
  cp.contact_value_hash,
  cp.source_kind,
  cp.verified_at,
  cp.suppression_status,
  cp.created_at,
  cv.contact_value
FROM public.research_contact_points cp
JOIN research_private.contact_vault cv
  ON cv.contact_point_id=cp.id;

CREATE TABLE public.research_response_design_context (
  response_id uuid PRIMARY KEY
    REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  study_id uuid NOT NULL
    REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL,
  sample_draw_id uuid NOT NULL
    REFERENCES public.research_sample_draws(id) ON DELETE RESTRICT,
  stratum_id uuid NOT NULL
    REFERENCES public.research_strata(id) ON DELETE RESTRICT,
  inclusion_probability numeric(20,12) NOT NULL
    CHECK (inclusion_probability > 0 AND inclusion_probability <= 1),
  base_weight numeric(20,8) NOT NULL CHECK (base_weight > 0),
  fieldwork_phase text NOT NULL CHECK (fieldwork_phase IN ('pilot','main')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_response_design_context_wave_study_fk
    FOREIGN KEY (wave_id,study_id)
    REFERENCES public.research_waves(id,study_id)
    ON DELETE RESTRICT
);

CREATE INDEX research_response_design_context_wave_stratum_idx
  ON public.research_response_design_context(wave_id,stratum_id,response_id);

CREATE TABLE public.research_identity_destruction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL,
  event_type text NOT NULL DEFAULT 'linkage_destruction'
    CHECK (event_type='linkage_destruction'),
  response_contexts_frozen integer NOT NULL CHECK (response_contexts_frozen >= 0),
  invites_detached integer NOT NULL CHECK (invites_detached >= 0),
  invite_messages_detached integer NOT NULL CHECK (invite_messages_detached >= 0),
  participant_deliveries_detached integer NOT NULL CHECK (participant_deliveries_detached >= 0),
  contact_points_destroyed integer NOT NULL CHECK (contact_points_destroyed >= 0),
  evidence_json jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  executed_by text NOT NULL CHECK (char_length(executed_by) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_identity_destruction_wave_study_fk
    FOREIGN KEY (wave_id,study_id)
    REFERENCES public.research_waves(id,study_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX research_identity_destruction_one_per_wave_idx
  ON public.research_identity_destruction_events(wave_id);

ALTER TABLE public.research_waves
  ADD COLUMN identity_retention_until timestamptz,
  ADD COLUMN identity_destroyed_at timestamptz,
  ADD CONSTRAINT research_waves_identity_retention_order_check
    CHECK (
      identity_destroyed_at IS NULL
      OR identity_retention_until IS NULL
      OR identity_destroyed_at >= identity_retention_until
    );

ALTER TABLE public.research_study_jobs
  DROP CONSTRAINT IF EXISTS research_study_jobs_job_type_check;

ALTER TABLE public.research_study_jobs
  ADD CONSTRAINT research_study_jobs_job_type_check
  CHECK (job_type IN (
    'frame_snapshot',
    'contact_enrichment',
    'sample_draw',
    'invite_batch',
    'invite_reminder',
    'reward_delivery',
    'weighting',
    'analysis',
    'release',
    'results_notification',
    'identity_destruction'
  ));

ALTER TABLE research_private.contact_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_response_design_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_identity_destruction_events ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_response_design_context FROM anon;
    REVOKE ALL ON public.research_identity_destruction_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_response_design_context FROM authenticated;
    REVOKE ALL ON public.research_identity_destruction_events FROM authenticated;
  END IF;
END;
$research$;

GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE research_private.contact_vault TO bls_platform_runtime;
GRANT SELECT ON TABLE research_private.contact_points_with_value TO bls_platform_runtime;
GRANT SELECT,INSERT ON TABLE public.research_response_design_context TO bls_platform_runtime;
GRANT SELECT,INSERT ON TABLE public.research_identity_destruction_events TO bls_platform_runtime;

CREATE POLICY research_private_contact_vault_platform_runtime
ON research_private.contact_vault
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_response_design_context_platform_runtime
ON public.research_response_design_context
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_identity_destruction_events_platform_runtime
ON public.research_identity_destruction_events
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE TRIGGER research_response_design_context_append_only
BEFORE UPDATE OR DELETE ON public.research_response_design_context
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

CREATE TRIGGER research_identity_destruction_events_append_only
BEFORE UPDATE OR DELETE ON public.research_identity_destruction_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

COMMIT;

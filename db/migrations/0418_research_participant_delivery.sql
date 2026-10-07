-- KONTA MOY — participant research delivery ledger and worker job types.
-- Schema 418 operationalizes post-completion thank-you delivery and
-- post-publication results notifications without coupling either workflow
-- to marketing consent.

BEGIN;

ALTER TABLE public.research_study_jobs
  DROP CONSTRAINT IF EXISTS research_study_jobs_job_type_check;

ALTER TABLE public.research_study_jobs
  ADD CONSTRAINT research_study_jobs_job_type_check
  CHECK (job_type IN (
    'frame_snapshot',
    'contact_enrichment',
    'sample_draw',
    'invite_batch',
    'reward_delivery',
    'weighting',
    'analysis',
    'release',
    'results_notification'
  ));

CREATE TABLE public.research_participant_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  response_id uuid NOT NULL REFERENCES public.research_responses(id) ON DELETE RESTRICT,
  contact_point_id uuid NOT NULL REFERENCES public.research_contact_points(id) ON DELETE RESTRICT,
  reward_entitlement_id uuid REFERENCES public.research_reward_entitlements(id) ON DELETE RESTRICT,
  release_snapshot_id uuid REFERENCES public.research_release_snapshots(id) ON DELETE RESTRICT,
  message_kind text NOT NULL CHECK (message_kind IN ('thank_you_code','results_notification')),
  consent_kind text NOT NULL CHECK (consent_kind IN ('thank_you_code','results_notification')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','sending','sent','failed','cancelled')),
  provider text NOT NULL DEFAULT 'ses',
  provider_message_id text,
  subject_sha256 text CHECK (subject_sha256 IS NULL OR subject_sha256 ~ '^[a-f0-9]{64}$'),
  body_sha256 text CHECK (body_sha256 IS NULL OR body_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      message_kind='thank_you_code'
      AND consent_kind='thank_you_code'
      AND reward_entitlement_id IS NOT NULL
      AND release_snapshot_id IS NULL
    )
    OR
    (
      message_kind='results_notification'
      AND consent_kind='results_notification'
      AND reward_entitlement_id IS NULL
      AND release_snapshot_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX research_participant_deliveries_reward_once_idx
  ON public.research_participant_deliveries(reward_entitlement_id)
  WHERE message_kind='thank_you_code';

CREATE UNIQUE INDEX research_participant_deliveries_release_once_idx
  ON public.research_participant_deliveries(response_id, release_snapshot_id)
  WHERE message_kind='results_notification';

CREATE UNIQUE INDEX research_participant_deliveries_provider_message_idx
  ON public.research_participant_deliveries(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX research_participant_deliveries_study_status_idx
  ON public.research_participant_deliveries(study_id, message_kind, status, created_at);

CREATE TABLE public.research_participant_delivery_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id uuid NOT NULL REFERENCES public.research_participant_deliveries(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'planned',
    'sending',
    'sent',
    'delivered',
    'opened',
    'bounced',
    'complained',
    'failed',
    'cancelled'
  )),
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX research_participant_delivery_events_delivery_time_idx
  ON public.research_participant_delivery_events(delivery_id, occurred_at DESC, id DESC);

ALTER TABLE public.research_participant_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_participant_delivery_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_participant_deliveries FROM anon;
    REVOKE ALL ON public.research_participant_delivery_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_participant_deliveries FROM authenticated;
    REVOKE ALL ON public.research_participant_delivery_events FROM authenticated;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.research_participant_deliveries TO bls_platform_runtime;
GRANT SELECT, INSERT ON TABLE public.research_participant_delivery_events TO bls_platform_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.research_participant_delivery_events_id_seq TO bls_platform_runtime;

CREATE POLICY research_participant_deliveries_platform_runtime
ON public.research_participant_deliveries
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_participant_delivery_events_platform_runtime
ON public.research_participant_delivery_events
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE TRIGGER research_participant_delivery_events_append_only
BEFORE UPDATE OR DELETE ON public.research_participant_delivery_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

COMMIT;

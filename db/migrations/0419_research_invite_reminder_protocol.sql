-- KONTA MOY — governed reminder/recontact protocol for research invitations.
-- Schema 419 keeps one canonical invite/response identity while allowing
-- additional opaque access tokens and auditable contact attempts.

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
    'invite_reminder',
    'reward_delivery',
    'weighting',
    'analysis',
    'release',
    'results_notification'
  ));

CREATE TABLE public.research_invite_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.research_invites(id) ON DELETE RESTRICT,
  recruitment_template_id uuid REFERENCES public.research_recruitment_templates(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  token_kind text NOT NULL CHECK (token_kind IN ('reminder','reissue')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at timestamptz,
  first_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status='active' AND revoked_at IS NULL)
    OR
    (status='revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX research_invite_access_tokens_invite_idx
  ON public.research_invite_access_tokens(invite_id, created_at DESC);

CREATE TABLE public.research_invite_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.research_study_jobs(id) ON DELETE SET NULL,
  invite_id uuid NOT NULL REFERENCES public.research_invites(id) ON DELETE RESTRICT,
  contact_point_id uuid NOT NULL REFERENCES public.research_contact_points(id) ON DELETE RESTRICT,
  recruitment_template_id uuid NOT NULL REFERENCES public.research_recruitment_templates(id) ON DELETE RESTRICT,
  access_token_id uuid REFERENCES public.research_invite_access_tokens(id) ON DELETE RESTRICT,
  attempt_kind text NOT NULL CHECK (attempt_kind IN ('initial','reminder','reissue')),
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','sending','sent','delivered','opened','bounced','complained','failed','cancelled')),
  provider text NOT NULL DEFAULT 'ses',
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_id, sequence_no)
);

CREATE UNIQUE INDEX research_invite_messages_provider_message_idx
  ON public.research_invite_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX research_invite_messages_job_invite_idx
  ON public.research_invite_messages(job_id, invite_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX research_invite_messages_invite_status_idx
  ON public.research_invite_messages(invite_id, attempt_kind, status, created_at);

ALTER TABLE public.research_invite_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_invite_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.research_invite_access_tokens FROM anon;
    REVOKE ALL ON public.research_invite_messages FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.research_invite_access_tokens FROM authenticated;
    REVOKE ALL ON public.research_invite_messages FROM authenticated;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.research_invite_access_tokens TO bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.research_invite_messages TO bls_platform_runtime;

CREATE POLICY research_invite_access_tokens_platform_runtime
ON public.research_invite_access_tokens
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_invite_messages_platform_runtime
ON public.research_invite_messages
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

-- Existing successful invitations become sequence 1 attempts. This is a
-- compatibility backfill only: their original canonical token remains in
-- research_invites and no plaintext token is introduced.
INSERT INTO public.research_invite_messages (
  invite_id,
  contact_point_id,
  recruitment_template_id,
  attempt_kind,
  sequence_no,
  status,
  provider,
  provider_message_id,
  sent_at,
  created_at,
  updated_at
)
SELECT
  ri.id,
  ri.contact_point_id,
  b.recruitment_template_id,
  'initial',
  1,
  CASE
    WHEN ri.status='opened' THEN 'opened'
    WHEN ri.status='completed' THEN 'opened'
    WHEN ri.status='suppressed' THEN 'bounced'
    ELSE 'sent'
  END,
  'ses',
  sent_event.provider_message_id,
  ri.sent_at,
  COALESCE(ri.sent_at,ri.created_at),
  now()
FROM public.research_invites ri
JOIN public.research_invite_batches b ON b.id=ri.batch_id
LEFT JOIN LATERAL (
  SELECT e.metadata->>'providerMessageId' AS provider_message_id
  FROM public.research_invite_events e
  WHERE e.invite_id=ri.id
    AND e.event_type='sent'
    AND COALESCE(e.metadata->>'providerMessageId','')<>''
  ORDER BY e.occurred_at DESC,e.id DESC
  LIMIT 1
) sent_event ON true
WHERE ri.sent_at IS NOT NULL
  AND ri.contact_point_id IS NOT NULL
  AND b.recruitment_template_id IS NOT NULL
ON CONFLICT (invite_id, sequence_no) DO NOTHING;

COMMIT;

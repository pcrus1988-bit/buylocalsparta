-- KONTA MOY — Admin SES/S3 mailbox.
-- Raw inbound RFC822 messages remain in the SES S3 bucket; PostgreSQL stores
-- searchable operational metadata, message text, delivery state and per-admin UI state.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('incoming','outgoing')),
  provider text NOT NULL DEFAULT 'ses',
  transport_key text NOT NULL UNIQUE,
  s3_object_key text UNIQUE,
  ses_message_id text,
  rfc_message_id text,
  in_reply_to text,
  reference_ids text[] NOT NULL DEFAULT '{}'::text[],
  thread_key text NOT NULL,
  from_address text NOT NULL,
  to_addresses text[] NOT NULL DEFAULT '{}'::text[],
  cc_addresses text[] NOT NULL DEFAULT '{}'::text[],
  bcc_addresses text[] NOT NULL DEFAULT '{}'::text[],
  reply_to text,
  subject text NOT NULL,
  preview text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  has_attachments boolean NOT NULL DEFAULT false,
  attachment_count integer NOT NULL DEFAULT 0 CHECK (attachment_count >= 0 AND attachment_count <= 100),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
  spam_verdict text,
  virus_verdict text,
  status text NOT NULL CHECK (status IN ('received','sent','failed')),
  delivery_error text,
  sent_at timestamptz,
  received_at timestamptz,
  created_by_user_public_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (direction='incoming' AND s3_object_key IS NOT NULL AND received_at IS NOT NULL)
    OR direction='outgoing'
  )
);

CREATE TABLE IF NOT EXISTS public.admin_mail_state (
  message_id uuid NOT NULL REFERENCES public.admin_mail_messages(id) ON DELETE CASCADE,
  user_public_id text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id,user_public_id)
);

CREATE INDEX IF NOT EXISTS admin_mail_messages_inbox_idx
  ON public.admin_mail_messages(direction,received_at DESC)
  WHERE direction='incoming';

CREATE INDEX IF NOT EXISTS admin_mail_messages_sent_idx
  ON public.admin_mail_messages(direction,sent_at DESC)
  WHERE direction='outgoing';

CREATE INDEX IF NOT EXISTS admin_mail_messages_thread_idx
  ON public.admin_mail_messages(thread_key,COALESCE(received_at,sent_at,created_at));

CREATE INDEX IF NOT EXISTS admin_mail_messages_subject_idx
  ON public.admin_mail_messages(lower(subject));

CREATE INDEX IF NOT EXISTS admin_mail_state_user_idx
  ON public.admin_mail_state(user_public_id,is_read,is_starred,archived_at);

ALTER TABLE public.admin_mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_mail_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_admin_mail_messages_runtime_all ON public.admin_mail_messages;
CREATE POLICY bls_admin_mail_messages_runtime_all ON public.admin_mail_messages
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS bls_admin_mail_state_runtime_all ON public.admin_mail_state;
CREATE POLICY bls_admin_mail_state_runtime_all ON public.admin_mail_state
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_mail_messages
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
REVOKE ALL ON TABLE public.admin_mail_state
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.admin_mail_messages,
  public.admin_mail_state
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.admin_mail_messages IS
  'Admin mailbox projection for AWS SES. Inbound raw RFC822 data remains authoritative in the configured S3 bucket.';
COMMENT ON COLUMN public.admin_mail_messages.transport_key IS
  'Idempotency key: s3:<object-key> for inbound or ses:<message-id> for successful outbound mail.';
COMMENT ON TABLE public.admin_mail_state IS
  'Per-Admin read, starred and archive state for the operational mailbox.';

COMMIT;

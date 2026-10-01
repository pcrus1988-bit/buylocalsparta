-- Admin mail console backed by SES + S3.
-- Raw RFC822/MIME payloads stay in object storage; PostgreSQL stores the searchable mailbox index.

CREATE TABLE IF NOT EXISTS admin_mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  provider text NOT NULL DEFAULT 'ses',
  provider_message_id text,
  internet_message_id text,
  thread_key text NOT NULL,
  in_reply_to text,
  references_header text[] NOT NULL DEFAULT '{}',
  from_address text NOT NULL,
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '(no subject)',
  body_text text,
  body_html text,
  body_preview text NOT NULL DEFAULT '',
  raw_bucket text,
  raw_object_key text,
  raw_etag text,
  raw_sha256 text,
  has_attachments boolean NOT NULL DEFAULT false,
  attachment_count integer NOT NULL DEFAULT 0 CHECK (attachment_count >= 0),
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  deleted_at timestamptz,
  delivery_status text NOT NULL CHECK (delivery_status IN ('received','draft','queued','sending','sent','delivered','bounced','complained','failed')),
  delivery_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz,
  sent_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_mail_inbound_received_at CHECK (direction <> 'inbound' OR received_at IS NOT NULL),
  CONSTRAINT admin_mail_outbound_sent_state CHECK (
    direction <> 'outbound'
    OR delivery_status IN ('draft','queued','sending','sent','delivered','bounced','complained','failed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_mail_messages_raw_object_unique
  ON admin_mail_messages(raw_bucket, raw_object_key)
  WHERE raw_bucket IS NOT NULL AND raw_object_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_mail_messages_provider_id_unique
  ON admin_mail_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_mail_messages_inbox_idx
  ON admin_mail_messages(received_at DESC, created_at DESC)
  WHERE direction='inbound' AND archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_mail_messages_sent_idx
  ON admin_mail_messages(sent_at DESC, created_at DESC)
  WHERE direction='outbound' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_mail_messages_thread_idx
  ON admin_mail_messages(thread_key, created_at);

CREATE INDEX IF NOT EXISTS admin_mail_messages_unread_idx
  ON admin_mail_messages(received_at DESC)
  WHERE direction='inbound' AND is_read=false AND archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_mail_messages_starred_idx
  ON admin_mail_messages(created_at DESC)
  WHERE is_starred=true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_mail_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES admin_mail_messages(id) ON DELETE CASCADE,
  part_index integer NOT NULL CHECK (part_index >= 0),
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  byte_size bigint NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  content_id text,
  disposition text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, part_index)
);

CREATE INDEX IF NOT EXISTS admin_mail_attachments_message_idx
  ON admin_mail_attachments(message_id, part_index);

CREATE TABLE IF NOT EXISTS admin_mail_sync_state (
  source text PRIMARY KEY,
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  scanned_objects integer NOT NULL DEFAULT 0 CHECK (scanned_objects >= 0),
  imported_messages integer NOT NULL DEFAULT 0 CHECK (imported_messages >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_mail_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_mail_sync_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE admin_mail_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE admin_mail_attachments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE admin_mail_sync_state FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_mail_messages TO bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_mail_attachments TO bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_mail_sync_state TO bls_platform_runtime;

DROP POLICY IF EXISTS bls_admin_mail_messages_platform_runtime_all ON admin_mail_messages;
CREATE POLICY bls_admin_mail_messages_platform_runtime_all
  ON admin_mail_messages
  FOR ALL TO bls_platform_runtime
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS bls_admin_mail_attachments_platform_runtime_all ON admin_mail_attachments;
CREATE POLICY bls_admin_mail_attachments_platform_runtime_all
  ON admin_mail_attachments
  FOR ALL TO bls_platform_runtime
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS bls_admin_mail_sync_state_platform_runtime_all ON admin_mail_sync_state;
CREATE POLICY bls_admin_mail_sync_state_platform_runtime_all
  ON admin_mail_sync_state
  FOR ALL TO bls_platform_runtime
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE admin_mail_messages IS 'Server-only Admin mailbox index for SES inbound/outbound email; raw MIME remains in S3.';
COMMENT ON TABLE admin_mail_attachments IS 'Attachment metadata for Admin mailbox messages. Binary data is read from the raw S3 MIME object on demand.';
COMMENT ON TABLE admin_mail_sync_state IS 'Operational status of inbound mailbox synchronization sources.';

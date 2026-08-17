-- Runtime hardening: verification, private-offer price provenance and notification state.
-- Designed to be additive to 0001_core.sql / 0002_runtime_hardening.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens(user_id, expires_at DESC);

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS pricing_source text NOT NULL DEFAULT 'catalog'
    CHECK (pricing_source IN ('catalog','private_offer')),
  ADD COLUMN IF NOT EXISTS source_reference text;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uidx
  ON notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications(user_id, created_at DESC)
  WHERE channel = 'in_app' AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_vendor_unread_idx
  ON notifications(vendor_id, created_at DESC)
  WHERE channel = 'in_app' AND read_at IS NULL;

COMMIT;

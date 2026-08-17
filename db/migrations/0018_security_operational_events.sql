-- Buy Local Sparta — security and operational event persistence
-- Security events intentionally contain hashes/masked metadata only. Raw passwords,
-- tokens, cookies, authorization headers, emails, phones and request bodies do not belong here.

CREATE TABLE security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN (
    'rate_limit.exceeded',
    'auth.login_failed',
    'csrf.rejected',
    'access.denied',
    'request.rejected'
  )),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  request_id text,
  route text,
  method text,
  subject_hash text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_public_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(COALESCE(route,'')) <= 300),
  CHECK (char_length(COALESCE(method,'')) <= 16),
  CHECK (char_length(COALESCE(subject_hash,'')) <= 128)
);

CREATE INDEX security_events_occurred_idx ON security_events (occurred_at DESC);
CREATE INDEX security_events_type_occurred_idx ON security_events (event_type, occurred_at DESC);
CREATE INDEX security_events_severity_occurred_idx ON security_events (severity, occurred_at DESC);
CREATE INDEX security_events_retention_idx ON security_events (retention_until);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events FORCE ROW LEVEL SECURITY;

CREATE POLICY security_events_platform_read ON security_events FOR SELECT
  USING ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY security_events_platform_insert ON security_events FOR INSERT
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY security_events_platform_delete ON security_events FOR DELETE
  USING ((SELECT bls_private.is_platform_runtime()));

-- Security evidence is append-only. Retention cleanup deletes expired rows rather than
-- rewriting historical evidence in place.
CREATE OR REPLACE FUNCTION forbid_security_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_events are append-only';
END $$;
CREATE TRIGGER security_events_no_update
  BEFORE UPDATE ON security_events
  FOR EACH ROW EXECUTE FUNCTION forbid_security_event_update();

COMMENT ON TABLE security_events IS 'Privacy-minimised append-only security evidence. Platform-only RLS; retention cleanup is delete-only.';
COMMENT ON COLUMN security_events.subject_hash IS 'One-way abuse-correlation key; never a raw IP/email/phone/session/token.';
COMMENT ON COLUMN security_events.details IS 'Sanitized bounded metadata only. Application code rejects secret-like keys before persistence.';

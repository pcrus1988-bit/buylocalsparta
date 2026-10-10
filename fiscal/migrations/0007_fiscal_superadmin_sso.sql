-- Independent marketplace super_admin federation: one-time tickets and Fiscal-owned sessions.
BEGIN;
CREATE TABLE IF NOT EXISTS fiscal_superadmin_sso_tickets (
  jti_hash char(64) PRIMARY KEY,
  marketplace_user_id text NOT NULL CHECK(length(marketplace_user_id) BETWEEN 5 AND 160),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS fiscal_superadmin_sso_ticket_expiry ON fiscal_superadmin_sso_tickets(expires_at);
CREATE TABLE IF NOT EXISTS fiscal_superadmin_sessions (
  token_hash char(64) PRIMARY KEY,
  csrf_hash char(64) NOT NULL,
  marketplace_user_id text NOT NULL CHECK(length(marketplace_user_id) BETWEEN 5 AND 160),
  marketplace_email text NOT NULL CHECK(length(marketplace_email) BETWEEN 5 AND 254),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_superadmin_session_user ON fiscal_superadmin_sessions(marketplace_user_id,expires_at);
-- Admin identities are not members of fiscal_organizations merely because they
-- supervise the provider. Merchant data access must remain explicit in route authorization.
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN
    ('fiscal_superadmin_sso_tickets','fiscal_superadmin_sessions')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',rec.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',rec.tablename);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',rec.tablename);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated',rec.tablename);
    END IF;
  END LOOP;
END; $$;
COMMIT;
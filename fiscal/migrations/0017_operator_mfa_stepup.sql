-- FISCAL 0017: opt-in operator MFA, TOTP sealed at rest; not required until rollout gate.
BEGIN;
CREATE TABLE public.fiscal_operator_mfa_factors (
  actor_kind text NOT NULL CHECK(actor_kind IN ('marketplace_super_admin','fiscal_admin')),
  actor_ref text NOT NULL CHECK(length(actor_ref) BETWEEN 5 AND 160),
  secret_ciphertext text NOT NULL CHECK(secret_ciphertext ~ '^v1:[a-f0-9]{24}:[a-f0-9]+:[a-f0-9]{32}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  pending_expires_at timestamptz NOT NULL,
  activated_at timestamptz,
  last_used_step bigint NOT NULL DEFAULT -1,
  PRIMARY KEY(actor_kind,actor_ref),
  CHECK(pending_expires_at>created_at AND pending_expires_at<=created_at+interval '15 minutes'),
  CHECK(
    (status='pending' AND activated_at IS NULL AND last_used_step=-1) OR
    (status='active' AND activated_at IS NOT NULL)
  )
);
CREATE TABLE public.fiscal_operator_mfa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind text NOT NULL,
  actor_ref text NOT NULL,
  session_binding_hash char(64) NOT NULL CHECK(session_binding_hash ~ '^[a-f0-9]{64}$'),
  token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY(actor_kind,actor_ref) REFERENCES public.fiscal_operator_mfa_factors(actor_kind,actor_ref) ON DELETE RESTRICT,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'),
  CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE INDEX fiscal_operator_mfa_sessions_actor_idx ON public.fiscal_operator_mfa_sessions(actor_kind,actor_ref,expires_at DESC);
CREATE INDEX fiscal_operator_mfa_sessions_binding_idx ON public.fiscal_operator_mfa_sessions(session_binding_hash,expires_at DESC);

ALTER TABLE public.fiscal_operator_mfa_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_operator_mfa_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_operator_mfa_factors,public.fiscal_operator_mfa_sessions FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_operator_mfa_factors,public.fiscal_operator_mfa_sessions FROM %I',r);
 END LOOP;
END $$;
COMMIT;

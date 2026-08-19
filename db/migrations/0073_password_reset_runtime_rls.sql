-- KONTA MOY — restore password-reset runtime access under RLS.
-- Data API roles remain revoked; only direct internal PostgreSQL runtimes may access reset tokens.

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_password_reset_runtime_all ON public.password_reset_tokens;
CREATE POLICY bls_password_reset_runtime_all ON public.password_reset_tokens
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.password_reset_tokens
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.password_reset_tokens
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.password_reset_tokens
  IS 'Private one-time password recovery tokens. Accessible only to direct application/platform PostgreSQL runtimes under RLS; not exposed through Supabase Data API roles.';

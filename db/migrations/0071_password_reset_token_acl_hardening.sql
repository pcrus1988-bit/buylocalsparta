-- KONTA MOY — keep password-reset tokens server-side only.
-- RLS already denies Data API rows; remove legacy/default object grants as defense in depth.

REVOKE ALL ON TABLE public.password_reset_tokens
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, DELETE
  ON public.password_reset_tokens
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.password_reset_tokens
  IS 'Private one-time password recovery tokens. Direct application/platform PostgreSQL runtimes only; not exposed through Supabase Data API roles.';

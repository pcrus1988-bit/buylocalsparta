-- KONTA MOY — verified customer login-email changes.
-- Keep the current login address active until the new address proves ownership.

BEGIN;

CREATE TABLE public.customer_email_change_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_email citext NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(target_email::text)) > 3),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR cancelled_at IS NULL)
);

CREATE UNIQUE INDEX customer_email_change_tokens_active_user_uidx
  ON public.customer_email_change_tokens(user_id)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE UNIQUE INDEX customer_email_change_tokens_active_target_uidx
  ON public.customer_email_change_tokens(target_email)
  WHERE consumed_at IS NULL AND cancelled_at IS NULL;

CREATE INDEX customer_email_change_tokens_user_history_idx
  ON public.customer_email_change_tokens(user_id, created_at DESC);

ALTER TABLE public.customer_email_change_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_customer_email_change_runtime_all ON public.customer_email_change_tokens;
CREATE POLICY bls_customer_email_change_runtime_all ON public.customer_email_change_tokens
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.customer_email_change_tokens
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.customer_email_change_tokens
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.customer_email_change_tokens
  IS 'Private one-time customer login-email change tokens and pending target addresses. Direct application/platform PostgreSQL runtimes only; never exposed through Supabase Data API roles.';

COMMIT;

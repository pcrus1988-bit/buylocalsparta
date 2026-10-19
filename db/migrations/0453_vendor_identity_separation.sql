-- Vendor/CLAIM credentials and sessions are isolated from users.password_hash / user_sessions.
-- Additive and safe for existing customer accounts and orders.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vendor_identity_credentials (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.vendor_identity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS vendor_identity_sessions_user_expiry_idx
  ON public.vendor_identity_sessions(user_id,expires_at DESC);
CREATE TABLE IF NOT EXISTS public.vendor_identity_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  target_scope text NOT NULL CHECK (target_scope IN ('vendor','claim')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS vendor_identity_resets_user_open_idx
  ON public.vendor_identity_reset_tokens(user_id,expires_at) WHERE consumed_at IS NULL;
ALTER TABLE public.vendor_identity_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_identity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_identity_reset_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vendor_identity_credentials,public.vendor_identity_sessions,public.vendor_identity_reset_tokens FROM PUBLIC,anon,authenticated;
COMMIT;

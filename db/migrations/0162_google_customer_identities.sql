-- KONTA MOU — external customer identities for Google OpenID Connect.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_external_identities_provider_subject_key UNIQUE (provider, provider_subject),
  CONSTRAINT user_external_identities_user_provider_key UNIQUE (user_id, provider),
  CONSTRAINT user_external_identities_provider_check CHECK (provider IN ('google'))
);

CREATE INDEX IF NOT EXISTS user_external_identities_user_idx
  ON public.user_external_identities(user_id);

COMMENT ON TABLE public.user_external_identities IS
  'Verified external login identities mapped to the existing KONTA MOU user record. Provider subject, not email, is the durable external identifier.';
COMMENT ON COLUMN public.user_external_identities.provider_subject IS
  'Stable provider subject identifier (Google OpenID Connect sub). Never derive authorization roles from this value.';

CREATE OR REPLACE FUNCTION public.remove_external_identities_when_user_closed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status::text = 'closed' AND OLD.status::text IS DISTINCT FROM 'closed' THEN
    DELETE FROM public.user_external_identities WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_remove_external_identities_when_closed ON public.users;
CREATE TRIGGER users_remove_external_identities_when_closed
AFTER UPDATE OF status ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.remove_external_identities_when_user_closed();

COMMIT;
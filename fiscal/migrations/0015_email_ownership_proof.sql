-- FISCAL 0015: auditable email ownership proof, NOT business/KYB verification.
BEGIN;
ALTER TABLE public.fiscal_users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE public.fiscal_email_verification_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.fiscal_users(id) ON DELETE RESTRICT,
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','consumed','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '20 minutes'),
 CHECK(
  (status='pending' AND consumed_at IS NULL AND revoked_at IS NULL) OR
  (status='consumed' AND consumed_at IS NOT NULL AND revoked_at IS NULL) OR
  (status='revoked' AND consumed_at IS NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX fiscal_email_one_pending_challenge_idx
 ON public.fiscal_email_verification_challenges(user_id) WHERE status='pending';
CREATE INDEX fiscal_email_challenges_by_user_idx
 ON public.fiscal_email_verification_challenges(user_id,created_at DESC);

CREATE FUNCTION public.fiscal_email_challenge_state_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Fiscal email verification evidence cannot be deleted'; END IF;
 IF (NEW.id,NEW.user_id,NEW.token_hash,NEW.created_at,NEW.expires_at)
  IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.token_hash,OLD.created_at,OLD.expires_at)
  OR OLD.status<>'pending' OR NEW.status NOT IN ('consumed','revoked')
 THEN RAISE EXCEPTION 'Fiscal email challenge can only transition once'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_email_challenge_state_guard_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_email_verification_challenges
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_email_challenge_state_guard();

ALTER TABLE public.fiscal_email_verification_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_email_verification_challenges FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_email_challenge_state_guard() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')
 LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_email_verification_challenges FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.fiscal_email_challenge_state_guard() FROM %I',r);
 END LOOP;
END $$;
COMMIT;

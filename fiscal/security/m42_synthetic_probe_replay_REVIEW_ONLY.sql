-- M42 REVIEW ONLY: not a fiscal migration; DO NOT APPLY to production.
-- Disposable fiscal_ci acceptance fixture for durable, single-use synthetic
-- Storage probe dispatch. This is NOT Supabase Storage JWT revocation.
BEGIN;
CREATE TABLE public.fiscal_synthetic_probe_replay (
  token_id uuid PRIMARY KEY,
  run_id uuid NOT NULL UNIQUE,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT fiscal_probe_lease_future CHECK (expires_at > consumed_at),
  CONSTRAINT fiscal_probe_lease_short CHECK (
    expires_at <= consumed_at + interval '5 minutes'
  )
);
ALTER TABLE public.fiscal_synthetic_probe_replay ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_synthetic_probe_replay FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_synthetic_probe_replay FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.fiscal_synthetic_probe_replay FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.fiscal_synthetic_probe_replay FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='fiscal_kyb_probe') THEN
    REVOKE ALL ON public.fiscal_synthetic_probe_replay FROM fiscal_kyb_probe;
  END IF;
END $$;
COMMIT;
-- No INSERT policies, role grants, RLS bypass, service-role delegation,
-- key provisioning or worker activation. Authorized writer design pending.
-- Entries intentionally have no deletion or expiry-based reuse path.

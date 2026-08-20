-- Harden human-reference counters for Supabase public-schema exposure.
-- Counter mutation remains restricted to SECURITY DEFINER functions in bls_private.
BEGIN;

ALTER TABLE public.public_reference_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_reference_counters FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_reference_counters_platform_read ON public.public_reference_counters;
CREATE POLICY public_reference_counters_platform_read
  ON public.public_reference_counters
  FOR SELECT
  TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.public_reference_counters
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT ON TABLE public.public_reference_counters TO bls_platform_runtime;

COMMIT;

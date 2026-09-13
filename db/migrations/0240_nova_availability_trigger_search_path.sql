-- KONTA MOY — harden NOVA availability TTL trigger execution context.
-- The production trigger exists on upgraded NOVA databases, but historical
-- clean migration chains may not contain the production-only 0232 function.
-- Harden it when present without making fresh database bootstraps fail.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.enforce_nova_availability_ttl_0232()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.enforce_nova_availability_ttl_0232() SET search_path = pg_catalog, public';
  END IF;
END
$$;

COMMIT;

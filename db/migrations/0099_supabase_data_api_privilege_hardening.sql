BEGIN;

-- Stage 4 security hardening: close the Supabase Data API surface for server-only
-- marketplace data access while preserving the dedicated PostgreSQL runtime roles.
--
-- The web application uses direct PostgreSQL connections through bls_app_runtime /
-- bls_platform_runtime. anon/authenticated/service_role therefore do not need direct
-- CRUD privileges on marketplace tables or sequences.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;

-- bls_private is an internal helper schema, not a client API.
REVOKE USAGE ON SCHEMA bls_private FROM anon, authenticated, service_role;

-- Existing PostgreSQL-owned helper functions: remove implicit/public Data API
-- execution and make the trusted server runtime roles explicit.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'bls_private')
      AND pg_get_userbyid(p.proowner) = 'postgres'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated, service_role',
      target.nspname, target.proname, target.args
    );

    -- Preserve server runtime behaviour explicitly, except helpers that are
    -- intentionally postgres-only and the postgres-owned cron bridge.
    IF NOT (
      (target.nspname = 'bls_private' AND target.proname IN ('next_public_reference', 'resolve_marketplace_public_reference'))
      OR (target.nspname = 'public' AND target.proname IN ('run_fiscal_reconciliation_cron', 'capture_checkout_started_analytics', 'capture_order_purchase_analytics'))
    ) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO bls_app_runtime, bls_platform_runtime',
        target.nspname, target.proname, target.args
      );
    END IF;
  END LOOP;
END
$$;

-- Fiscal reconciliation is scheduled by pg_cron as postgres. It must never be
-- reachable as a public RPC or from application runtime credentials. Clean
-- PostGIS CI does not create this Supabase production helper, so guard it.
DO $$
BEGIN
  IF to_regprocedure('public.run_fiscal_reconciliation_cron()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.run_fiscal_reconciliation_cron() FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime';
  END IF;
END
$$;

-- Supabase Security Advisor reports these PostGIS SECURITY DEFINER helpers as
-- callable by Data API roles. The marketplace does not expose them as RPCs.
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- Future postgres-owned objects are deny-by-default for Supabase Data API roles.
-- Hosted Supabase owns these objects as postgres; plain PostGIS CI may not define
-- that role, so only apply these owner defaults when it exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA bls_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$$;

COMMIT;
-- Supabase advisor remediation: pin unprivileged FISCAL trigger function search paths.
-- All functions remain SECURITY INVOKER and may not be called by Data API roles.
BEGIN;
ALTER FUNCTION public.fiscal_audit_immutable() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fiscal_marketplace_link_integrity() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fiscal_intake_lines_immutable() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fiscal_counterparties_immutable() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fiscal_regulatory_immutable() SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.fiscal_audit_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_marketplace_link_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_intake_lines_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_counterparties_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_regulatory_immutable() FROM PUBLIC;

DO $$
DECLARE role_name text;
DECLARE routine_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')
  LOOP
    FOREACH routine_name IN ARRAY ARRAY[
      'fiscal_audit_immutable',
      'fiscal_marketplace_link_integrity',
      'fiscal_intake_lines_immutable',
      'fiscal_counterparties_immutable',
      'fiscal_regulatory_immutable'
    ]
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM %I',routine_name,role_name);
    END LOOP;
  END LOOP;
END $$;
COMMIT;

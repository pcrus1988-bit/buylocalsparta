-- KONTA MOY — harden research analysis-plan trigger functions before production rollout.
-- Schema 0421 removes unnecessary SECURITY DEFINER execution from public-schema
-- trigger functions and restricts direct invocation to the platform runtime role.

BEGIN;

ALTER FUNCTION public.research_prepare_analysis_plan()
  SECURITY INVOKER;

ALTER FUNCTION public.research_guard_analysis_plan_delete()
  SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.research_prepare_analysis_plan()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.research_guard_analysis_plan_delete()
  FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_prepare_analysis_plan() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.research_guard_analysis_plan_delete() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_prepare_analysis_plan() FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.research_guard_analysis_plan_delete() FROM authenticated;
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.research_prepare_analysis_plan()
  TO bls_platform_runtime;

GRANT EXECUTE ON FUNCTION public.research_guard_analysis_plan_delete()
  TO bls_platform_runtime;

COMMIT;

-- KONTA MOY — freeze Greek Retail Study sampling frame once fieldwork starts.
-- A published comparison must be reproducible against the exact population
-- cells used when invitations were generated.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_retail_research_stratum_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_study_id uuid;
  target_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_study_id := OLD.study_id;
  ELSE
    target_study_id := NEW.study_id;
  END IF;

  SELECT status INTO target_status
    FROM public.retail_research_studies
   WHERE id = target_study_id;

  IF target_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Retail research sampling frame is frozen outside draft status';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.retail_research_invitations
     WHERE study_id = target_study_id
     LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Retail research sampling frame is frozen after invitations exist';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS retail_research_strata_freeze_guard
  ON public.retail_research_strata;

CREATE TRIGGER retail_research_strata_freeze_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.retail_research_strata
FOR EACH ROW EXECUTE FUNCTION public.guard_retail_research_stratum_mutation();

REVOKE ALL ON FUNCTION public.guard_retail_research_stratum_mutation()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_retail_research_stratum_mutation()
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON FUNCTION public.guard_retail_research_stratum_mutation() IS
  'Freezes Greek Retail Study population cells after the first invitation or when fieldwork leaves draft, preserving reproducible weighting denominators.';

COMMIT;

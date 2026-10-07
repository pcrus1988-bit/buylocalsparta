-- KONTA MOY — freeze randomized experiment assignments and completed choices.
-- Schema 0422 makes profile randomization immutable from insertion onward and
-- only permits choice/answered_at updates while the parent response is in progress.

BEGIN;

CREATE OR REPLACE FUNCTION public.research_guard_experiment_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  response_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RESEARCH_EXPERIMENT_ASSIGNMENT_DELETE_FORBIDDEN';
  END IF;

  IF NEW.response_id IS DISTINCT FROM OLD.response_id
    OR NEW.experiment_code IS DISTINCT FROM OLD.experiment_code
    OR NEW.task_number IS DISTINCT FROM OLD.task_number
    OR NEW.randomization_seed IS DISTINCT FROM OLD.randomization_seed
    OR NEW.alternative_a IS DISTINCT FROM OLD.alternative_a
    OR NEW.alternative_b IS DISTINCT FROM OLD.alternative_b THEN
    RAISE EXCEPTION 'RESEARCH_EXPERIMENT_RANDOMIZATION_IMMUTABLE';
  END IF;

  SELECT status
  INTO response_status
  FROM public.research_responses
  WHERE id = OLD.response_id;

  IF response_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'RESEARCH_EXPERIMENT_CHOICE_CLOSED';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS research_experiment_assignments_immutable
  ON public.research_experiment_assignments;

CREATE TRIGGER research_experiment_assignments_immutable
BEFORE UPDATE OR DELETE ON public.research_experiment_assignments
FOR EACH ROW
EXECUTE FUNCTION public.research_guard_experiment_assignment_mutation();

REVOKE EXECUTE ON FUNCTION public.research_guard_experiment_assignment_mutation()
  FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_experiment_assignment_mutation() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_experiment_assignment_mutation() FROM authenticated;
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.research_guard_experiment_assignment_mutation()
  TO bls_platform_runtime;

COMMIT;

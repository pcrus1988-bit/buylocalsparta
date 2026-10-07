-- KONTA MOY — freeze sample-planning assumptions with every governed draw.
-- Schema 0424 makes the admin planner part of the evidence chain instead of
-- transient UI state, including per-stratum completion targets and feasibility.

BEGIN;

ALTER TABLE public.research_sample_draws
  ADD CONSTRAINT research_sample_draws_id_study_phase_unique
  UNIQUE (id, study_id, fieldwork_phase);

CREATE TABLE public.research_sample_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_draw_id uuid NOT NULL UNIQUE,
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  fieldwork_phase text NOT NULL CHECK (fieldwork_phase IN ('pilot','main')),
  desired_complete_n integer NOT NULL CHECK (desired_complete_n > 0),
  expected_response_rate numeric(8,6) NOT NULL CHECK (expected_response_rate > 0 AND expected_response_rate <= 1),
  eligible_population_n integer NOT NULL CHECK (eligible_population_n > 0),
  active_contact_n integer NOT NULL CHECK (active_contact_n >= 0 AND active_contact_n <= eligible_population_n),
  contactability_rate numeric(8,6) NOT NULL CHECK (contactability_rate >= 0 AND contactability_rate <= 1),
  planned_selected_n integer NOT NULL CHECK (planned_selected_n > 0 AND planned_selected_n <= eligible_population_n),
  expected_contactable_n integer NOT NULL CHECK (expected_contactable_n >= 0 AND expected_contactable_n <= planned_selected_n),
  expected_complete_n integer NOT NULL CHECK (expected_complete_n >= 0 AND expected_complete_n <= expected_contactable_n),
  allocation_method text NOT NULL CHECK (allocation_method IN ('proportional_min2_v1')),
  design_json jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sample_draw_id, study_id, fieldwork_phase)
    REFERENCES public.research_sample_draws(id, study_id, fieldwork_phase)
    ON DELETE RESTRICT
);

CREATE TABLE public.research_sample_design_strata (
  design_id uuid NOT NULL REFERENCES public.research_sample_designs(id) ON DELETE RESTRICT,
  stratum_id uuid NOT NULL REFERENCES public.research_strata(id) ON DELETE RESTRICT,
  population_n integer NOT NULL CHECK (population_n > 0),
  active_contact_n integer NOT NULL CHECK (active_contact_n >= 0 AND active_contact_n <= population_n),
  selected_n integer NOT NULL CHECK (selected_n >= 0 AND selected_n <= population_n),
  target_complete_n integer NOT NULL CHECK (target_complete_n >= 0 AND target_complete_n <= selected_n),
  expected_contactable_n integer NOT NULL CHECK (expected_contactable_n >= 0 AND expected_contactable_n <= selected_n),
  expected_complete_n integer NOT NULL CHECK (expected_complete_n >= 0 AND expected_complete_n <= expected_contactable_n),
  PRIMARY KEY (design_id, stratum_id)
);

CREATE INDEX research_sample_designs_study_phase_created_idx
  ON public.research_sample_designs(study_id, fieldwork_phase, created_at DESC);

CREATE OR REPLACE FUNCTION public.research_guard_sample_design_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
BEGIN
  RAISE EXCEPTION 'research sample design evidence is immutable';
END;
$research$;

CREATE TRIGGER research_sample_designs_immutable
BEFORE UPDATE OR DELETE ON public.research_sample_designs
FOR EACH ROW EXECUTE FUNCTION public.research_guard_sample_design_mutation();

CREATE TRIGGER research_sample_design_strata_immutable
BEFORE UPDATE OR DELETE ON public.research_sample_design_strata
FOR EACH ROW EXECUTE FUNCTION public.research_guard_sample_design_mutation();

ALTER TABLE public.research_sample_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sample_design_strata ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_sample_designs FROM anon;
    REVOKE ALL ON public.research_sample_design_strata FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_sample_designs FROM authenticated;
    REVOKE ALL ON public.research_sample_design_strata FROM authenticated;
  END IF;
END;
$research$;

GRANT SELECT, INSERT ON TABLE public.research_sample_designs TO bls_platform_runtime;
GRANT SELECT, INSERT ON TABLE public.research_sample_design_strata TO bls_platform_runtime;

CREATE POLICY research_sample_designs_platform_runtime
ON public.research_sample_designs
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY research_sample_design_strata_platform_runtime
ON public.research_sample_design_strata
FOR ALL
TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

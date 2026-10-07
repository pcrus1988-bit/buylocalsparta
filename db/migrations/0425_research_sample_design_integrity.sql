-- KONTA MOY — harden immutable sample-design evidence at the database boundary.
-- Schema 0425 permits sample-design construction only while its draw is draft,
-- validates design/draw identity, and prevents late stratum inserts after lock.

BEGIN;

CREATE OR REPLACE FUNCTION public.research_guard_sample_design_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  draw_status text;
  draw_study_id uuid;
  draw_phase text;
  draw_frame_snapshot_id uuid;
  draw_target_n integer;
  stratum_frame_snapshot_id uuid;
  actual_selected_n integer;
BEGIN
  IF TG_TABLE_NAME = 'research_sample_designs' THEN
    SELECT d.status,d.study_id,d.fieldwork_phase,d.frame_snapshot_id,d.target_n
    INTO draw_status,draw_study_id,draw_phase,draw_frame_snapshot_id,draw_target_n
    FROM public.research_sample_draws d
    WHERE d.id=NEW.sample_draw_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'research sample design requires an existing sample draw';
    END IF;
    IF draw_status <> 'draft' THEN
      RAISE EXCEPTION 'research sample design may only be created while the sample draw is draft';
    END IF;
    IF NEW.study_id IS DISTINCT FROM draw_study_id
       OR NEW.fieldwork_phase IS DISTINCT FROM draw_phase THEN
      RAISE EXCEPTION 'research sample design identity does not match its sample draw';
    END IF;
    IF NEW.planned_selected_n IS DISTINCT FROM draw_target_n THEN
      RAISE EXCEPTION 'research sample design planned selected n does not match the sample draw target';
    END IF;
    IF COALESCE(NEW.design_json->>'sampleDrawId','') <> NEW.sample_draw_id::text
       OR COALESCE(NEW.design_json->>'fieldworkPhase','') <> NEW.fieldwork_phase
       OR COALESCE((NEW.design_json->>'desiredCompleteN')::integer,-1) <> NEW.desired_complete_n
       OR COALESCE((NEW.design_json->>'plannedSelectedN')::integer,-1) <> NEW.planned_selected_n THEN
      RAISE EXCEPTION 'research sample design JSON does not match governed design columns';
    END IF;
    RETURN NEW;
  END IF;

  SELECT d.status,d.frame_snapshot_id
  INTO draw_status,draw_frame_snapshot_id
  FROM public.research_sample_designs sd
  JOIN public.research_sample_draws d ON d.id=sd.sample_draw_id
  WHERE sd.id=NEW.design_id
  FOR SHARE OF d;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'research sample design stratum requires an existing design';
  END IF;
  IF draw_status <> 'draft' THEN
    RAISE EXCEPTION 'research sample design strata may only be created while the sample draw is draft';
  END IF;

  SELECT st.frame_snapshot_id
  INTO stratum_frame_snapshot_id
  FROM public.research_strata st
  WHERE st.id=NEW.stratum_id;

  IF NOT FOUND OR stratum_frame_snapshot_id IS DISTINCT FROM draw_frame_snapshot_id THEN
    RAISE EXCEPTION 'research sample design stratum does not belong to the sample draw frame';
  END IF;

  SELECT count(*)::integer
  INTO actual_selected_n
  FROM public.research_sample_units su
  JOIN public.research_sample_designs sd ON sd.id=NEW.design_id
  WHERE su.sample_draw_id=sd.sample_draw_id
    AND su.stratum_id=NEW.stratum_id;

  IF actual_selected_n IS DISTINCT FROM NEW.selected_n THEN
    RAISE EXCEPTION 'research sample design selected n does not match persisted sample units';
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_sample_designs_insert_guard
BEFORE INSERT ON public.research_sample_designs
FOR EACH ROW EXECUTE FUNCTION public.research_guard_sample_design_insert();

CREATE TRIGGER research_sample_design_strata_insert_guard
BEFORE INSERT ON public.research_sample_design_strata
FOR EACH ROW EXECUTE FUNCTION public.research_guard_sample_design_insert();

REVOKE EXECUTE ON FUNCTION public.research_guard_sample_design_insert() FROM PUBLIC;
DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_sample_design_insert() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_sample_design_insert() FROM authenticated;
  END IF;
END;
$research$;
GRANT EXECUTE ON FUNCTION public.research_guard_sample_design_insert() TO bls_platform_runtime;

COMMIT;

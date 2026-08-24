-- KONTA MOU — sparse driver-presence samples and automatic operational-state normalization.
-- Presence samples let the existing dispatcher see idle on-shift drivers without restoring high-frequency GPS history writes.

BEGIN;

ALTER TABLE public.delivery_location_pings
  ALTER COLUMN job_id DROP NOT NULL,
  ADD COLUMN sample_kind text NOT NULL DEFAULT 'job'
    CHECK (sample_kind IN ('job','presence','event'));

ALTER TABLE public.delivery_location_pings
  ADD CONSTRAINT delivery_location_pings_scope_check CHECK (
    (sample_kind = 'presence' AND job_id IS NULL) OR
    (sample_kind <> 'presence' AND job_id IS NOT NULL)
  );

CREATE INDEX delivery_location_pings_driver_time_idx
  ON public.delivery_location_pings (driver_id, received_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_delivery_driver_operational_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_driver uuid;
  still_active boolean;
BEGIN
  target_driver := COALESCE(NEW.driver_id, OLD.driver_id);
  IF target_driver IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP <> 'DELETE'
     AND NEW.driver_id IS NOT NULL
     AND NEW.status IN ('assigned','in_progress') THEN
    UPDATE public.delivery_drivers
       SET operational_status = CASE WHEN accepting_jobs THEN 'busy' ELSE operational_status END,
           updated_at = now()
     WHERE id = NEW.driver_id
       AND status = 'active';
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.delivery_jobs j
     WHERE j.driver_id = target_driver
       AND j.status IN ('assigned','in_progress')
  ) INTO still_active;

  IF NOT still_active THEN
    UPDATE public.delivery_drivers
       SET operational_status = CASE
             WHEN accepting_jobs AND (shift_ends_at IS NULL OR shift_ends_at > now()) THEN 'available'
             WHEN accepting_jobs THEN 'off_shift'
             ELSE operational_status
           END,
           accepting_jobs = CASE
             WHEN accepting_jobs AND shift_ends_at IS NOT NULL AND shift_ends_at <= now() THEN false
             ELSE accepting_jobs
           END,
           updated_at = now()
     WHERE id = target_driver
       AND status = 'active';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER delivery_jobs_driver_operational_state
AFTER INSERT OR UPDATE OF driver_id, status OR DELETE
ON public.delivery_jobs
FOR EACH ROW
EXECUTE FUNCTION public.normalize_delivery_driver_operational_state();

COMMENT ON COLUMN public.delivery_location_pings.sample_kind IS
  'job = sparse customer/audit sample for an active delivery; presence = sparse on-shift driver sample with no job; event = future event-boundary sample.';

COMMIT;

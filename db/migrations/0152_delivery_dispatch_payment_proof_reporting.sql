-- KONTA MOU — delivery dispatch eligibility, QR proof evidence, shift timekeeping and reporting foundations.
-- Outbound delivery assignment is allowed only for paid, non-cancelled orders.
-- QR/stop proof events are append-only and retain the server timestamp plus location evidence used for later settlement/reporting.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_delivery_outbound_dispatch_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  dispatchable boolean;
BEGIN
  IF NEW.job_type::text <> 'outbound'
     OR (NEW.driver_id IS NULL AND NEW.status::text NOT IN ('assigned','in_progress')) THEN
    RETURN NEW;
  END IF;

  SELECT
    o.status::text NOT IN ('draft','pending_payment','requires_customer_action','cancelled','refunded','disputed')
    AND COALESCE((
      SELECT SUM(GREATEST(p.captured_minor - p.refunded_minor, 0))
      FROM public.payments p
      WHERE p.order_id = o.id
        AND p.status::text = 'captured'
    ), 0) >= o.total_minor
  INTO dispatchable
  FROM public.customer_orders o
  WHERE o.id = NEW.order_id;

  IF NOT COALESCE(dispatchable, false) THEN
    RAISE EXCEPTION 'Outbound delivery cannot be assigned before full captured payment or after order cancellation/refund'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_jobs_outbound_dispatch_eligibility_guard ON public.delivery_jobs;
CREATE TRIGGER delivery_jobs_outbound_dispatch_eligibility_guard
  BEFORE INSERT OR UPDATE OF driver_id, status, order_id, job_type
  ON public.delivery_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_delivery_outbound_dispatch_eligibility();

CREATE TABLE public.delivery_proof_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_proof_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE RESTRICT,
  stop_id uuid NOT NULL REFERENCES public.delivery_stops(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE RESTRICT,
  proof_kind text NOT NULL
    CHECK (proof_kind IN ('vendor_pickup','customer_delivery','customer_return_pickup','vendor_return_receipt')),
  proof_source text NOT NULL
    CHECK (proof_source IN ('driver_scan','vendor_confirmation')),
  server_recorded_at timestamptz NOT NULL DEFAULT now(),
  device_recorded_at timestamptz,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  location_source text NOT NULL DEFAULT 'missing'
    CHECK (location_source IN ('scan_device','current_presence_snapshot','missing')),
  location_age_seconds numeric(12,3) CHECK (location_age_seconds IS NULL OR location_age_seconds >= 0),
  evidence_status text NOT NULL DEFAULT 'location_missing'
    CHECK (evidence_status IN ('verified','location_missing','location_stale','low_accuracy')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_proof_events_coordinates_pair_check
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  UNIQUE (job_id, stop_id, proof_kind)
);

CREATE INDEX delivery_proof_events_market_time_idx
  ON public.delivery_proof_events (market_id, server_recorded_at DESC);
CREATE INDEX delivery_proof_events_driver_time_idx
  ON public.delivery_proof_events (driver_id, server_recorded_at DESC);
CREATE INDEX delivery_proof_events_evidence_idx
  ON public.delivery_proof_events (market_id, evidence_status, server_recorded_at DESC);

CREATE TABLE public.delivery_driver_shift_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_shift_event_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(id) ON DELETE RESTRICT,
  event_type text NOT NULL
    CHECK (event_type IN ('shift_start','resume','pause','shift_end','unavailable')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  source text NOT NULL DEFAULT 'driver_action'
    CHECK (source IN ('driver_action','system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_driver_shift_events_coordinates_pair_check
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX delivery_driver_shift_events_driver_time_idx
  ON public.delivery_driver_shift_events (driver_id, occurred_at DESC);
CREATE INDEX delivery_driver_shift_events_market_time_idx
  ON public.delivery_driver_shift_events (market_id, occurred_at DESC);

ALTER TABLE public.delivery_proof_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_shift_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_proof_events_runtime_all
  ON public.delivery_proof_events
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

CREATE POLICY delivery_driver_shift_events_runtime_all
  ON public.delivery_driver_shift_events
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER delivery_proof_events_append_only
  BEFORE UPDATE OR DELETE ON public.delivery_proof_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_audit_mutation();

CREATE TRIGGER delivery_driver_shift_events_append_only
  BEFORE UPDATE OR DELETE ON public.delivery_driver_shift_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_audit_mutation();

REVOKE ALL ON TABLE public.delivery_proof_events, public.delivery_driver_shift_events
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT ON TABLE public.delivery_proof_events, public.delivery_driver_shift_events
  TO bls_app_runtime, bls_platform_runtime;

-- Remove stale, unassigned outbound work that is not backed by full captured payment
-- or whose source order is no longer eligible. Active/in-progress work is never silently erased.
UPDATE public.delivery_assignment_offers ao
SET state = 'withdrawn',
    responded_at = COALESCE(ao.responded_at, now())
WHERE ao.state IN ('candidate','offered')
  AND EXISTS (
    SELECT 1
    FROM public.delivery_jobs j
    JOIN public.customer_orders o ON o.id = j.order_id
    WHERE j.id = ao.job_id
      AND j.job_type::text = 'outbound'
      AND j.driver_id IS NULL
      AND j.status::text IN ('queued','ready')
      AND (
        o.status::text IN ('draft','pending_payment','requires_customer_action','cancelled','refunded','disputed')
        OR COALESCE((
          SELECT SUM(GREATEST(p.captured_minor - p.refunded_minor, 0))
          FROM public.payments p
          WHERE p.order_id = o.id
            AND p.status::text = 'captured'
        ), 0) < o.total_minor
      )
  );

UPDATE public.delivery_jobs j
SET status = 'cancelled',
    live_tracking_enabled = false,
    assignment_lock_reason = 'source_order_not_dispatchable',
    updated_at = now()
FROM public.customer_orders o
WHERE j.order_id = o.id
  AND j.job_type::text = 'outbound'
  AND j.driver_id IS NULL
  AND j.status::text IN ('queued','ready')
  AND (
    o.status::text IN ('draft','pending_payment','requires_customer_action','cancelled','refunded','disputed')
    OR COALESCE((
      SELECT SUM(GREATEST(p.captured_minor - p.refunded_minor, 0))
      FROM public.payments p
      WHERE p.order_id = o.id
        AND p.status::text = 'captured'
    ), 0) < o.total_minor
  );

COMMENT ON TABLE public.delivery_proof_events IS
  'Append-only settlement-grade delivery stop evidence. Records QR/confirmation server time, driver, stop and GPS evidence status.';
COMMENT ON TABLE public.delivery_driver_shift_events IS
  'Append-only driver shift state transitions used for auditable timekeeping and delivery-partner reporting.';
COMMENT ON FUNCTION public.guard_delivery_outbound_dispatch_eligibility() IS
  'Database backstop preventing outbound delivery assignment/in-progress state unless the order is eligible and fully captured.';

COMMIT;

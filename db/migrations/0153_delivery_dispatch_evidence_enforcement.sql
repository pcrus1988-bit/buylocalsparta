-- KONTA MOU — delivery eligibility enforcement, automatic proof capture and auditable shift events.
-- Strengthens 0152 so unpaid/cancelled outbound work cannot even reach the offer stage,
-- while QR/stop completions and driver state transitions become settlement-grade evidence.

BEGIN;

CREATE TABLE public.delivery_dispatch_eligibility_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('delivery_eligibility_' || replace(gen_random_uuid()::text, '-', '')),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.customer_orders(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('blocked_payment','blocked_order_state','released')),
  order_status text NOT NULL,
  captured_minor bigint NOT NULL DEFAULT 0 CHECK (captured_minor >= 0),
  required_minor bigint NOT NULL DEFAULT 0 CHECK (required_minor >= 0),
  reason text NOT NULL,
  event_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_dispatch_eligibility_events_market_time_idx
  ON public.delivery_dispatch_eligibility_events (market_id, occurred_at DESC);
CREATE INDEX delivery_dispatch_eligibility_events_job_time_idx
  ON public.delivery_dispatch_eligibility_events (job_id, occurred_at DESC);

ALTER TABLE public.delivery_dispatch_eligibility_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_dispatch_eligibility_events_runtime_all
  ON public.delivery_dispatch_eligibility_events
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER delivery_dispatch_eligibility_events_append_only
  BEFORE UPDATE OR DELETE ON public.delivery_dispatch_eligibility_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delivery_audit_mutation();

REVOKE ALL ON TABLE public.delivery_dispatch_eligibility_events
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT ON TABLE public.delivery_dispatch_eligibility_events
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION public.delivery_outbound_order_is_dispatchable(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT
      o.status::text NOT IN ('draft','pending_payment','requires_customer_action','cancelled','refunded','disputed')
      AND COALESCE((
        SELECT SUM(GREATEST(p.captured_minor - p.refunded_minor, 0))
        FROM public.payments p
        WHERE p.order_id=o.id
          AND p.status::text='captured'
      ),0) >= o.total_minor
    FROM public.customer_orders o
    WHERE o.id=p_order_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.normalize_delivery_outbound_dispatchability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_status text;
  v_total_minor bigint := 0;
  v_captured_minor bigint := 0;
  v_dispatchable boolean := false;
  v_reason text;
  v_event_type text;
  v_event_key text;
  v_attempted_status text;
BEGIN
  IF NEW.job_type::text <> 'outbound' OR NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_attempted_status := NEW.status::text;

  SELECT
    o.status::text,
    o.total_minor,
    COALESCE((
      SELECT SUM(GREATEST(p.captured_minor-p.refunded_minor,0))
      FROM public.payments p
      WHERE p.order_id=o.id AND p.status::text='captured'
    ),0)
  INTO v_order_status,v_total_minor,v_captured_minor
  FROM public.customer_orders o
  WHERE o.id=NEW.order_id;

  v_dispatchable :=
    v_order_status IS NOT NULL
    AND v_order_status NOT IN ('draft','pending_payment','requires_customer_action','cancelled','refunded','disputed')
    AND v_captured_minor >= v_total_minor;

  IF NOT v_dispatchable THEN
    v_reason := CASE
      WHEN v_order_status IS NULL THEN 'source_order_missing'
      WHEN v_order_status IN ('cancelled','refunded','disputed') THEN 'source_order_not_dispatchable'
      WHEN v_order_status IN ('draft','pending_payment','requires_customer_action') THEN 'payment_required'
      WHEN v_captured_minor < v_total_minor THEN 'payment_required'
      ELSE 'source_order_not_dispatchable'
    END;
    v_event_type := CASE
      WHEN v_reason='payment_required' THEN 'blocked_payment'
      ELSE 'blocked_order_state'
    END;

    IF NEW.driver_id IS NOT NULL OR NEW.status::text IN ('assigned','in_progress') THEN
      RAISE EXCEPTION 'Outbound delivery cannot be assigned before full captured payment or after order cancellation/refund'
        USING ERRCODE='check_violation';
    END IF;

    IF NEW.status::text='ready' THEN
      NEW.status := 'queued';
      NEW.live_tracking_enabled := false;
    END IF;
    NEW.assignment_lock_reason := v_reason;

    v_event_key := md5(
      NEW.id::text || ':' || v_event_type || ':' ||
      COALESCE(v_order_status,'missing') || ':' ||
      v_captured_minor::text || ':' || v_total_minor::text
    );

    INSERT INTO public.delivery_dispatch_eligibility_events(
      market_id,job_id,order_id,event_type,order_status,captured_minor,required_minor,reason,event_key,metadata,occurred_at
    ) VALUES(
      NEW.market_id,NEW.id,NEW.order_id,v_event_type,COALESCE(v_order_status,'missing'),
      v_captured_minor,v_total_minor,v_reason,v_event_key,
      jsonb_build_object('attemptedStatus',v_attempted_status),now()
    )
    ON CONFLICT(event_key) DO NOTHING;
  ELSE
    IF NEW.assignment_lock_reason IN ('payment_required','source_order_not_dispatchable','source_order_missing') THEN
      NEW.assignment_lock_reason := NULL;
      v_event_key := md5(
        NEW.id::text || ':released:' || COALESCE(v_order_status,'missing') || ':' ||
        v_captured_minor::text || ':' || v_total_minor::text
      );
      INSERT INTO public.delivery_dispatch_eligibility_events(
        market_id,job_id,order_id,event_type,order_status,captured_minor,required_minor,reason,event_key,metadata,occurred_at
      ) VALUES(
        NEW.market_id,NEW.id,NEW.order_id,'released',COALESCE(v_order_status,'missing'),
        v_captured_minor,v_total_minor,'payment_valid',v_event_key,'{}'::jsonb,now()
      )
      ON CONFLICT(event_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_jobs_00_normalize_dispatchability ON public.delivery_jobs;
CREATE TRIGGER delivery_jobs_00_normalize_dispatchability
  BEFORE INSERT OR UPDATE OF status,driver_id,order_id,job_type
  ON public.delivery_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_delivery_outbound_dispatchability();

CREATE OR REPLACE FUNCTION public.guard_delivery_assignment_offer_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job_type text;
  v_order_id uuid;
  v_job_status text;
BEGIN
  IF NEW.state NOT IN ('candidate','offered') THEN
    RETURN NEW;
  END IF;

  SELECT j.job_type::text,j.order_id,j.status::text
  INTO v_job_type,v_order_id,v_job_status
  FROM public.delivery_jobs j
  WHERE j.id=NEW.job_id;

  IF v_job_type='outbound' AND (
    v_job_status <> 'ready'
    OR NOT public.delivery_outbound_order_is_dispatchable(v_order_id)
  ) THEN
    RAISE EXCEPTION 'Delivery offer blocked: source order is not dispatchable'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_assignment_offers_dispatch_eligibility_guard ON public.delivery_assignment_offers;
CREATE TRIGGER delivery_assignment_offers_dispatch_eligibility_guard
  BEFORE INSERT OR UPDATE OF state,job_id
  ON public.delivery_assignment_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_delivery_assignment_offer_eligibility();

UPDATE public.delivery_jobs j
SET status='queued',
    cancelled_at=NULL,
    assignment_lock_reason='payment_required',
    live_tracking_enabled=false,
    updated_at=now()
FROM public.customer_orders o
WHERE j.order_id=o.id
  AND j.job_type='outbound'
  AND j.driver_id IS NULL
  AND j.status='cancelled'
  AND j.assignment_lock_reason='source_order_not_dispatchable'
  AND o.status::text NOT IN ('cancelled','refunded','disputed');

UPDATE public.delivery_jobs j
SET status='queued',
    assignment_lock_reason=CASE
      WHEN o.status::text IN ('cancelled','refunded','disputed') THEN 'source_order_not_dispatchable'
      ELSE 'payment_required'
    END,
    live_tracking_enabled=false,
    updated_at=now()
FROM public.customer_orders o
WHERE j.order_id=o.id
  AND j.job_type='outbound'
  AND j.driver_id IS NULL
  AND j.status='ready'
  AND NOT public.delivery_outbound_order_is_dispatchable(o.id);

UPDATE public.delivery_assignment_offers ao
SET state='withdrawn',
    responded_at=COALESCE(ao.responded_at,now())
WHERE ao.state IN ('candidate','offered')
  AND EXISTS (
    SELECT 1
    FROM public.delivery_jobs j
    WHERE j.id=ao.job_id
      AND j.job_type='outbound'
      AND (
        j.status <> 'ready'
        OR NOT public.delivery_outbound_order_is_dispatchable(j.order_id)
      )
  );

CREATE OR REPLACE FUNCTION public.refresh_outbound_delivery_dispatchability_for_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := CASE WHEN TG_TABLE_NAME='payments' THEN NEW.order_id ELSE NEW.id END;

  UPDATE public.delivery_jobs
  SET status=status,
      updated_at=now()
  WHERE order_id=v_order_id
    AND job_type='outbound'
    AND driver_id IS NULL
    AND status IN ('queued','ready');

  UPDATE public.delivery_assignment_offers ao
  SET state='withdrawn',
      responded_at=COALESCE(ao.responded_at,now())
  WHERE ao.state IN ('candidate','offered')
    AND EXISTS (
      SELECT 1 FROM public.delivery_jobs j
      WHERE j.id=ao.job_id
        AND j.order_id=v_order_id
        AND j.job_type='outbound'
        AND NOT public.delivery_outbound_order_is_dispatchable(v_order_id)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_refresh_outbound_delivery_dispatchability_insert ON public.payments;
CREATE TRIGGER payments_refresh_outbound_delivery_dispatchability_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_outbound_delivery_dispatchability_for_order();

DROP TRIGGER IF EXISTS payments_refresh_outbound_delivery_dispatchability_update ON public.payments;
CREATE TRIGGER payments_refresh_outbound_delivery_dispatchability_update
  AFTER UPDATE OF status,captured_minor,refunded_minor ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_outbound_delivery_dispatchability_for_order();

DROP TRIGGER IF EXISTS customer_orders_refresh_outbound_delivery_dispatchability ON public.customer_orders;
CREATE TRIGGER customer_orders_refresh_outbound_delivery_dispatchability
  AFTER UPDATE OF status,total_minor ON public.customer_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_outbound_delivery_dispatchability_for_order();

ALTER TABLE public.delivery_proof_events
  ADD COLUMN IF NOT EXISTS distance_to_stop_m numeric(12,2)
    CHECK (distance_to_stop_m IS NULL OR distance_to_stop_m >= 0);

ALTER TABLE public.delivery_proof_events
  DROP CONSTRAINT IF EXISTS delivery_proof_events_evidence_status_check;
ALTER TABLE public.delivery_proof_events
  ADD CONSTRAINT delivery_proof_events_evidence_status_check
  CHECK (evidence_status IN ('verified','location_missing','location_stale','low_accuracy','location_mismatch'));

CREATE OR REPLACE FUNCTION public.capture_delivery_stop_proof_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_market_id uuid;
  v_proof_kind text;
  v_loc record;
  v_recorded_at timestamptz;
  v_age numeric(12,3);
  v_distance numeric(12,2);
  v_status text;
BEGIN
  IF NEW.status <> 'completed'
     OR OLD.status='completed'
     OR NEW.completed_by_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT j.market_id INTO v_market_id
  FROM public.delivery_jobs j
  WHERE j.id=NEW.job_id;

  v_proof_kind := CASE NEW.stop_kind
    WHEN 'vendor_pickup' THEN 'vendor_pickup'
    WHEN 'customer_dropoff' THEN 'customer_delivery'
    WHEN 'customer_return_pickup' THEN 'customer_return_pickup'
    WHEN 'vendor_return_dropoff' THEN 'vendor_return_receipt'
    ELSE NULL
  END;

  IF v_market_id IS NULL OR v_proof_kind IS NULL THEN
    RETURN NEW;
  END IF;

  v_recorded_at := COALESCE(NEW.completed_at,now());

  SELECT latitude,longitude,accuracy_m,device_recorded_at,received_at
  INTO v_loc
  FROM public.delivery_driver_location_current
  WHERE driver_id=NEW.completed_by_driver_id
  LIMIT 1;

  IF v_loc.received_at IS NOT NULL THEN
    v_age := GREATEST(0,EXTRACT(EPOCH FROM (v_recorded_at-v_loc.received_at)))::numeric(12,3);
  END IF;

  IF v_loc.latitude IS NOT NULL
     AND v_loc.longitude IS NOT NULL
     AND NEW.latitude IS NOT NULL
     AND NEW.longitude IS NOT NULL THEN
    v_distance := (
      ST_DistanceSphere(
        ST_MakePoint(v_loc.longitude,v_loc.latitude),
        ST_MakePoint(NEW.longitude,NEW.latitude)
      )
    )::numeric(12,2);
  END IF;

  v_status := CASE
    WHEN v_loc.latitude IS NULL OR v_loc.longitude IS NULL THEN 'location_missing'
    WHEN v_age IS NULL OR v_age > 180 THEN 'location_stale'
    WHEN v_loc.accuracy_m IS NULL OR v_loc.accuracy_m > 100 THEN 'low_accuracy'
    WHEN v_distance IS NOT NULL AND v_distance > 500 THEN 'location_mismatch'
    ELSE 'verified'
  END;

  INSERT INTO public.delivery_proof_events(
    market_id,job_id,stop_id,driver_id,proof_kind,proof_source,
    server_recorded_at,device_recorded_at,latitude,longitude,accuracy_m,
    location_source,location_age_seconds,distance_to_stop_m,evidence_status,metadata
  ) VALUES(
    v_market_id,NEW.job_id,NEW.id,NEW.completed_by_driver_id,v_proof_kind,'driver_scan',
    v_recorded_at,v_loc.device_recorded_at,v_loc.latitude,v_loc.longitude,v_loc.accuracy_m,
    CASE WHEN v_loc.latitude IS NULL THEN 'missing' ELSE 'current_presence_snapshot' END,
    v_age,v_distance,v_status,
    jsonb_build_object(
      'capture','delivery_stop_completion_trigger',
      'stopKind',NEW.stop_kind,
      'expectedLatitude',NEW.latitude,
      'expectedLongitude',NEW.longitude
    )
  )
  ON CONFLICT(job_id,stop_id,proof_kind) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_stops_capture_proof_event ON public.delivery_stops;
CREATE TRIGGER delivery_stops_capture_proof_event
  AFTER UPDATE OF status ON public.delivery_stops
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.capture_delivery_stop_proof_event();

INSERT INTO public.delivery_proof_events(
  market_id,job_id,stop_id,driver_id,proof_kind,proof_source,
  server_recorded_at,location_source,evidence_status,metadata
)
SELECT
  j.market_id,s.job_id,s.id,s.completed_by_driver_id,
  CASE s.stop_kind
    WHEN 'vendor_pickup' THEN 'vendor_pickup'
    WHEN 'customer_dropoff' THEN 'customer_delivery'
    WHEN 'customer_return_pickup' THEN 'customer_return_pickup'
    WHEN 'vendor_return_dropoff' THEN 'vendor_return_receipt'
  END,
  'driver_scan',
  COALESCE(s.completed_at,s.updated_at),
  'missing',
  'location_missing',
  jsonb_build_object('backfilled',true,'reason','completion_predates_automatic_proof_capture')
FROM public.delivery_stops s
JOIN public.delivery_jobs j ON j.id=s.job_id
WHERE s.status='completed'
  AND s.completed_by_driver_id IS NOT NULL
  AND s.stop_kind IN ('vendor_pickup','customer_dropoff','customer_return_pickup','vendor_return_dropoff')
ON CONFLICT(job_id,stop_id,proof_kind) DO NOTHING;

CREATE OR REPLACE FUNCTION public.capture_delivery_driver_shift_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event_type text;
  v_market_id uuid;
  v_loc record;
BEGIN
  IF OLD.operational_status IS NOT DISTINCT FROM NEW.operational_status
     AND OLD.accepting_jobs IS NOT DISTINCT FROM NEW.accepting_jobs THEN
    RETURN NEW;
  END IF;

  v_event_type := CASE
    WHEN NEW.operational_status='off_shift' THEN 'shift_end'
    WHEN NEW.operational_status='paused' THEN 'pause'
    WHEN NEW.operational_status='unavailable' THEN 'unavailable'
    WHEN NEW.operational_status IN ('available','busy')
         AND OLD.operational_status='off_shift' THEN 'shift_start'
    WHEN NEW.operational_status IN ('available','busy')
         AND OLD.operational_status IN ('paused','unavailable') THEN 'resume'
    WHEN NEW.accepting_jobs=true AND OLD.accepting_jobs=false THEN 'resume'
    ELSE NULL
  END;

  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT j.market_id INTO v_market_id
  FROM public.delivery_jobs j
  WHERE j.driver_id=NEW.id
  ORDER BY j.updated_at DESC
  LIMIT 1;

  IF v_market_id IS NULL THEN
    SELECT market_id INTO v_market_id
    FROM public.delivery_dispatch_settings
    WHERE active=true
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_market_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT latitude,longitude,accuracy_m
  INTO v_loc
  FROM public.delivery_driver_location_current
  WHERE driver_id=NEW.id
  LIMIT 1;

  INSERT INTO public.delivery_driver_shift_events(
    market_id,driver_id,event_type,occurred_at,latitude,longitude,accuracy_m,source,metadata
  ) VALUES(
    v_market_id,NEW.id,v_event_type,now(),v_loc.latitude,v_loc.longitude,v_loc.accuracy_m,'system',
    jsonb_build_object(
      'previousOperationalStatus',OLD.operational_status,
      'operationalStatus',NEW.operational_status,
      'previousAcceptingJobs',OLD.accepting_jobs,
      'acceptingJobs',NEW.accepting_jobs
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_drivers_capture_shift_event ON public.delivery_drivers;
CREATE TRIGGER delivery_drivers_capture_shift_event
  AFTER UPDATE OF operational_status,accepting_jobs
  ON public.delivery_drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_delivery_driver_shift_event();

INSERT INTO public.delivery_driver_shift_events(
  market_id,driver_id,event_type,occurred_at,latitude,longitude,accuracy_m,source,metadata
)
SELECT
  COALESCE(j.market_id,ds.market_id),d.id,'shift_start',d.shift_started_at,
  lc.latitude,lc.longitude,lc.accuracy_m,'system',
  jsonb_build_object('backfilled',true,'reason','active_shift_at_automatic_timekeeping_activation')
FROM public.delivery_drivers d
LEFT JOIN LATERAL (
  SELECT dj.market_id
  FROM public.delivery_jobs dj
  WHERE dj.driver_id=d.id
  ORDER BY dj.updated_at DESC
  LIMIT 1
) j ON true
LEFT JOIN LATERAL (
  SELECT market_id
  FROM public.delivery_dispatch_settings
  WHERE active=true
  ORDER BY created_at
  LIMIT 1
) ds ON true
LEFT JOIN public.delivery_driver_location_current lc ON lc.driver_id=d.id
WHERE d.status='active'
  AND d.accepting_jobs=true
  AND d.operational_status IN ('available','busy')
  AND d.shift_started_at IS NOT NULL
  AND COALESCE(j.market_id,ds.market_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.delivery_driver_shift_events e
    WHERE e.driver_id=d.id
      AND e.event_type='shift_start'
      AND e.occurred_at=d.shift_started_at
  );

COMMENT ON FUNCTION public.delivery_outbound_order_is_dispatchable(uuid) IS
  'Single server-side source of truth for outbound delivery dispatch eligibility: valid order state plus full captured non-refunded payment.';
COMMENT ON TABLE public.delivery_dispatch_eligibility_events IS
  'Append-only audit of outbound jobs blocked/released by payment or source-order dispatch eligibility.';
COMMENT ON FUNCTION public.capture_delivery_stop_proof_event() IS
  'Creates settlement-grade stop proof from completion timestamp plus the driver current GPS snapshot, accuracy, age and distance to the expected stop.';
COMMENT ON FUNCTION public.capture_delivery_driver_shift_event() IS
  'Captures driver operational state transitions as append-only shift/timekeeping evidence.';

COMMIT;

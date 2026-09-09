-- KONTA MOU — fix delivery dispatch eligibility audit ordering.
-- Eligibility normalization remains a BEFORE trigger so it can gate and normalize the job row.
-- Audit evidence is recorded AFTER the delivery_jobs row exists, preserving the strict job_id FK.

BEGIN;

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
BEGIN
  IF NEW.job_type::text <> 'outbound' OR NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

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

    IF NEW.driver_id IS NOT NULL OR NEW.status::text IN ('assigned','in_progress') THEN
      RAISE EXCEPTION 'Outbound delivery cannot be assigned before full captured payment or after order cancellation/refund'
        USING ERRCODE='check_violation';
    END IF;

    IF NEW.status::text='ready' THEN
      NEW.status := 'queued';
      NEW.live_tracking_enabled := false;
    END IF;
    NEW.assignment_lock_reason := v_reason;
  ELSE
    IF NEW.assignment_lock_reason IN ('payment_required','source_order_not_dispatchable','source_order_missing') THEN
      NEW.assignment_lock_reason := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_delivery_outbound_dispatchability_event()
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
BEGIN
  IF NEW.job_type::text <> 'outbound' OR NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

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
      jsonb_build_object('normalizedStatus',NEW.status::text),now()
    )
    ON CONFLICT(event_key) DO NOTHING;
  ELSIF TG_OP='UPDATE'
        AND OLD.assignment_lock_reason IN ('payment_required','source_order_not_dispatchable','source_order_missing')
        AND NEW.assignment_lock_reason IS NULL THEN
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_jobs_90_record_dispatchability_event ON public.delivery_jobs;
CREATE TRIGGER delivery_jobs_90_record_dispatchability_event
  AFTER INSERT OR UPDATE OF status,driver_id,order_id,job_type
  ON public.delivery_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.record_delivery_outbound_dispatchability_event();

COMMENT ON FUNCTION public.normalize_delivery_outbound_dispatchability() IS
  'Normalizes and guards outbound delivery dispatchability before the job row is written. Audit insertion is intentionally deferred to an AFTER trigger so the job FK already exists.';

COMMENT ON FUNCTION public.record_delivery_outbound_dispatchability_event() IS
  'Records append-only outbound dispatch eligibility evidence after delivery_jobs exists, preserving the strict eligibility-event job_id foreign key.';

COMMIT;

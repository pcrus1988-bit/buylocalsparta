-- KONTA MOU — invalidate active outbound delivery when its source order stops being dispatchable.
-- Cancels legacy/current driver assignments after cancellation, refund, dispute or loss of captured payment.

BEGIN;

CREATE OR REPLACE FUNCTION public.invalidate_active_outbound_delivery_for_order(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job record;
  v_count integer := 0;
  v_reason text;
  v_order_status text;
  v_captured_minor bigint := 0;
  v_required_minor bigint := 0;
BEGIN
  IF p_order_id IS NULL OR public.delivery_outbound_order_is_dispatchable(p_order_id) THEN
    RETURN 0;
  END IF;

  SELECT
    o.status::text,
    o.total_minor,
    COALESCE((
      SELECT SUM(GREATEST(p.captured_minor - p.refunded_minor, 0))
      FROM public.payments p
      WHERE p.order_id=o.id AND p.status::text='captured'
    ), 0)
  INTO v_order_status, v_required_minor, v_captured_minor
  FROM public.customer_orders o
  WHERE o.id=p_order_id;

  v_reason := CASE
    WHEN v_order_status IN ('cancelled','refunded','disputed') THEN 'source_order_not_dispatchable'
    WHEN v_captured_minor < v_required_minor THEN 'payment_required'
    ELSE 'source_order_not_dispatchable'
  END;

  UPDATE public.delivery_assignment_offers ao
  SET state='withdrawn',
      responded_at=COALESCE(ao.responded_at, now())
  WHERE ao.state IN ('candidate','offered')
    AND EXISTS (
      SELECT 1
      FROM public.delivery_jobs j
      WHERE j.id=ao.job_id
        AND j.order_id=p_order_id
        AND j.job_type='outbound'
    );

  FOR v_job IN
    SELECT j.id, j.public_id, j.market_id, j.driver_id, j.status::text AS previous_status
    FROM public.delivery_jobs j
    WHERE j.order_id=p_order_id
      AND j.job_type='outbound'
      AND j.status IN ('assigned','in_progress')
    FOR UPDATE
  LOOP
    UPDATE public.delivery_jobs
    SET status='cancelled',
        partner_id=NULL,
        driver_id=NULL,
        live_tracking_enabled=false,
        cancelled_at=COALESCE(cancelled_at, now()),
        assignment_lock_reason=v_reason,
        updated_at=now()
    WHERE id=v_job.id;

    INSERT INTO public.delivery_events(
      id, public_id, job_id, event_type, actor_type, actor_public_id,
      customer_visible, message, metadata, occurred_at
    ) VALUES (
      gen_random_uuid(),
      'delivery_event_' || replace(gen_random_uuid()::text, '-', ''),
      v_job.id,
      'dispatch.assignment_invalidated',
      'system',
      NULL,
      true,
      'Η ανάθεση οδηγού ακυρώθηκε αυτόματα επειδή η παραγγελία δεν είναι πλέον επιλέξιμη για παράδοση.',
      jsonb_build_object(
        'reason', v_reason,
        'previousStatus', v_job.previous_status,
        'previousDriverId', v_job.driver_id,
        'orderStatus', COALESCE(v_order_status,'missing'),
        'capturedMinor', v_captured_minor,
        'requiredMinor', v_required_minor
      ),
      now()
    );

    INSERT INTO public.delivery_dispatch_eligibility_events(
      market_id, job_id, order_id, event_type, order_status,
      captured_minor, required_minor, reason, event_key, metadata, occurred_at
    ) VALUES (
      v_job.market_id,
      v_job.id,
      p_order_id,
      CASE WHEN v_reason='payment_required' THEN 'blocked_payment' ELSE 'blocked_order_state' END,
      COALESCE(v_order_status,'missing'),
      v_captured_minor,
      v_required_minor,
      v_reason,
      md5(v_job.id::text || ':active_invalidated:' || COALESCE(v_order_status,'missing') || ':' || v_captured_minor::text || ':' || v_required_minor::text),
      jsonb_build_object('previousStatus', v_job.previous_status, 'previousDriverId', v_job.driver_id),
      now()
    )
    ON CONFLICT(event_key) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.invalidate_active_outbound_delivery_after_source_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := CASE WHEN TG_TABLE_NAME='payments' THEN NEW.order_id ELSE NEW.id END;
  PERFORM public.invalidate_active_outbound_delivery_for_order(v_order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_orders_invalidate_active_delivery ON public.customer_orders;
CREATE TRIGGER customer_orders_invalidate_active_delivery
  AFTER UPDATE OF status,total_minor ON public.customer_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_active_outbound_delivery_after_source_change();

DROP TRIGGER IF EXISTS payments_invalidate_active_delivery_insert ON public.payments;
CREATE TRIGGER payments_invalidate_active_delivery_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_active_outbound_delivery_after_source_change();

DROP TRIGGER IF EXISTS payments_invalidate_active_delivery_update ON public.payments;
CREATE TRIGGER payments_invalidate_active_delivery_update
  AFTER UPDATE OF status,captured_minor,refunded_minor ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_active_outbound_delivery_after_source_change();

-- Reconcile any legacy active outbound assignments that became invalid before these guards existed.
DO $$
DECLARE
  v_order record;
BEGIN
  FOR v_order IN
    SELECT DISTINCT j.order_id
    FROM public.delivery_jobs j
    WHERE j.job_type='outbound'
      AND j.status IN ('assigned','in_progress')
      AND NOT public.delivery_outbound_order_is_dispatchable(j.order_id)
  LOOP
    PERFORM public.invalidate_active_outbound_delivery_for_order(v_order.order_id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.invalidate_active_outbound_delivery_for_order(uuid) IS
  'Immediately withdraws offers and cancels active outbound driver assignments when the source order is cancelled/refunded/disputed or no longer fully captured.';

COMMIT;

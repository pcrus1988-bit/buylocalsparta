-- KONTA MOU — repair outbound delivery trigger row-shape handling.
-- Migrations 0153/0154 used CASE expressions that referenced NEW.order_id even
-- when fired for customer_orders, where the transition row has only NEW.id.
-- Keep the existing dispatchability/invalidation policies intact while selecting
-- the source order id with table-specific control flow.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_outbound_delivery_dispatchability_for_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF TG_TABLE_NAME='payments' THEN
    v_order_id := NEW.order_id;
  ELSIF TG_TABLE_NAME='customer_orders' THEN
    v_order_id := NEW.id;
  ELSE
    RAISE EXCEPTION 'Unsupported dispatchability trigger source table: %', TG_TABLE_NAME;
  END IF;

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

CREATE OR REPLACE FUNCTION public.invalidate_active_outbound_delivery_after_source_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF TG_TABLE_NAME='payments' THEN
    v_order_id := NEW.order_id;
  ELSIF TG_TABLE_NAME='customer_orders' THEN
    v_order_id := NEW.id;
  ELSE
    RAISE EXCEPTION 'Unsupported invalidation trigger source table: %', TG_TABLE_NAME;
  END IF;

  PERFORM public.invalidate_active_outbound_delivery_for_order(v_order_id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.refresh_outbound_delivery_dispatchability_for_order() IS
  'Refreshes outbound delivery dispatchability after customer order or payment changes without cross-table NEW-field references.';
COMMENT ON FUNCTION public.invalidate_active_outbound_delivery_after_source_change() IS
  'Invalidates active outbound delivery after customer order or payment changes, resolving the source order id without cross-table NEW-field references.';

COMMIT;

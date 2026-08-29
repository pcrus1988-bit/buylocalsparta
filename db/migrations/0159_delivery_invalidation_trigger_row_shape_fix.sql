-- KONTA MOU — repair outbound delivery invalidation trigger row-shape handling.
-- Migration 0154 used a CASE expression that referenced NEW.order_id even when
-- fired for customer_orders, where the transition row has only NEW.id.
-- Keep the existing invalidation policy intact while selecting the order id
-- with table-specific control flow so PostgreSQL never resolves a missing field.

BEGIN;

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

COMMENT ON FUNCTION public.invalidate_active_outbound_delivery_after_source_change() IS
  'Invalidates active outbound delivery after customer order or payment changes, resolving the source order id without cross-table NEW-field references.';

COMMIT;

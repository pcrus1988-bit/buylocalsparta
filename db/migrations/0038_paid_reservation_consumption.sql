-- Buy Local Sparta — allow vendor acceptance to consume protected paid reservations
-- after the original checkout TTL elapsed. Unpaid expired reservations remain non-consumable.
BEGIN;

CREATE OR REPLACE FUNCTION consume_stock_reservation(
  p_reservation_id uuid,
  p_now timestamptz,
  p_actor_id uuid DEFAULT NULL
) RETURNS stock_reservations AS $$
DECLARE
  v_reservation stock_reservations%ROWTYPE;
  v_balance inventory_balances%ROWTYPE;
  v_order_status text;
BEGIN
  SELECT * INTO v_reservation
  FROM stock_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reservation not found';
  END IF;
  IF v_reservation.status = 'consumed' THEN
    RETURN v_reservation;
  END IF;
  IF v_reservation.status <> 'active' THEN
    RAISE EXCEPTION 'cannot consume % reservation', v_reservation.status;
  END IF;

  IF v_reservation.expires_at <= p_now THEN
    SELECT o.status::text INTO v_order_status
    FROM order_lines ol
    JOIN customer_orders o ON o.id = ol.order_id
    WHERE ol.id = v_reservation.order_line_id;

    IF COALESCE(v_order_status, '') NOT IN (
      'confirmed','partially_fulfilled','fulfilled','completed',
      'partially_refunded','refunded','disputed'
    ) THEN
      RAISE EXCEPTION 'cannot consume expired reservation';
    END IF;
  END IF;

  SELECT * INTO v_balance
  FROM inventory_balances
  WHERE offer_id = v_reservation.offer_id
  FOR UPDATE;

  IF v_balance.on_hand < v_reservation.quantity OR v_balance.active_reservations < v_reservation.quantity THEN
    RAISE EXCEPTION 'inventory corruption while consuming reservation %', p_reservation_id;
  END IF;

  UPDATE inventory_balances
     SET on_hand = on_hand - v_reservation.quantity,
         active_reservations = active_reservations - v_reservation.quantity,
         updated_at = p_now
   WHERE offer_id = v_reservation.offer_id;

  UPDATE stock_reservations
     SET status = 'consumed', consumed_at = p_now
   WHERE id = p_reservation_id
   RETURNING * INTO v_reservation;

  INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, reservation_id, source, actor_id, created_at)
  VALUES (v_reservation.offer_id, 'consume', -v_reservation.quantity, v_reservation.id, 'order', p_actor_id, p_now);

  RETURN v_reservation;
END;
$$ LANGUAGE plpgsql;

COMMIT;

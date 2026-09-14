-- Make API-authoritative dropship availability the inventory source of truth at checkout.
-- Local inventory behavior remains unchanged. No supplier forwarding/payment behavior is changed.

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_market_id uuid,
  p_checkout_key text,
  p_offer_id uuid,
  p_cart_item_id uuid,
  p_quantity integer,
  p_now timestamp with time zone,
  p_expires_at timestamp with time zone
)
RETURNS stock_reservations
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing stock_reservations%ROWTYPE;
  v_balance inventory_balances%ROWTYPE;
  v_reservation stock_reservations%ROWTYPE;
  v_expired_quantity integer := 0;
  v_available integer;
  v_authoritative boolean := false;
  v_supplier_active boolean;
  v_supplier_offer_active boolean;
  v_supplier_available boolean;
  v_supplier_quantity integer;
  v_supplier_checked_at timestamptz;
  v_supplier_expires_at timestamptz;
  v_supplier_ttl_seconds integer;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'reservation quantity must be positive'; END IF;
  IF p_expires_at <= p_now THEN RAISE EXCEPTION 'reservation expiry must be in the future'; END IF;

  SELECT * INTO v_existing
  FROM stock_reservations
  WHERE checkout_key = p_checkout_key AND offer_id = p_offer_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'active' THEN
      IF v_existing.quantity <> p_quantity THEN RAISE EXCEPTION 'idempotent reservation replay changed quantity'; END IF;
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'checkout reservation is no longer active; create a new checkout attempt';
  END IF;

  SELECT
    ds.api_authoritative_availability,
    ds.active,
    dso.active,
    dso.cached_available,
    dso.cached_quantity,
    dso.availability_checked_at,
    dso.availability_expires_at
  INTO
    v_authoritative,
    v_supplier_active,
    v_supplier_offer_active,
    v_supplier_available,
    v_supplier_quantity,
    v_supplier_checked_at,
    v_supplier_expires_at
  FROM dropship_supplier_offers dso
  JOIN dropship_suppliers ds ON ds.id = dso.supplier_id
  WHERE dso.vendor_offer_id = p_offer_id
  FOR SHARE OF dso, ds;

  IF FOUND AND v_authoritative THEN
    IF NOT v_supplier_active OR NOT v_supplier_offer_active THEN
      RAISE EXCEPTION 'supplier offer is inactive for offer %', p_offer_id;
    END IF;
    IF v_supplier_expires_at IS NULL OR v_supplier_expires_at <= p_now THEN
      RAISE EXCEPTION 'supplier availability is stale for offer %', p_offer_id;
    END IF;
    IF NOT COALESCE(v_supplier_available, false) OR COALESCE(v_supplier_quantity, 0) < 1 THEN
      RAISE EXCEPTION 'supplier reports no stock for offer %', p_offer_id;
    END IF;

    v_supplier_ttl_seconds := GREATEST(
      1,
      LEAST(
        2147483647,
        FLOOR(EXTRACT(EPOCH FROM (v_supplier_expires_at - COALESCE(v_supplier_checked_at, p_now))))::bigint
      )::integer
    );

    INSERT INTO inventory_balances (
      offer_id,
      on_hand,
      active_reservations,
      safety_stock,
      blocked,
      source,
      source_confidence,
      updated_at,
      stock_confirmed_at,
      freshness_ttl_seconds,
      freshness_status
    ) VALUES (
      p_offer_id,
      v_supplier_quantity,
      0,
      0,
      0,
      'supplier_api',
      'supplier_confirmed',
      p_now,
      COALESCE(v_supplier_checked_at, p_now),
      v_supplier_ttl_seconds,
      'fresh'
    )
    ON CONFLICT (offer_id) DO UPDATE
       SET on_hand = GREATEST(EXCLUDED.on_hand, inventory_balances.active_reservations),
           source = 'supplier_api',
           source_confidence = 'supplier_confirmed',
           updated_at = p_now,
           stock_confirmed_at = COALESCE(v_supplier_checked_at, p_now),
           freshness_ttl_seconds = v_supplier_ttl_seconds,
           freshness_status = 'fresh';
  END IF;

  SELECT * INTO v_balance FROM inventory_balances WHERE offer_id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory balance not found for offer %', p_offer_id; END IF;

  WITH expired AS (
    UPDATE stock_reservations sr
       SET status = 'expired', released_at = p_now
     WHERE sr.offer_id = p_offer_id
       AND sr.status = 'active'
       AND sr.expires_at <= p_now
       AND NOT EXISTS (
         SELECT 1
         FROM order_lines ol
         JOIN customer_orders o ON o.id = ol.order_id
         WHERE ol.id = sr.order_line_id
           AND o.status::text IN ('confirmed','partially_fulfilled','fulfilled','completed','partially_refunded','refunded','disputed')
       )
     RETURNING sr.quantity
  )
  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_expired_quantity FROM expired;

  IF v_expired_quantity > 0 THEN
    UPDATE inventory_balances
       SET active_reservations = active_reservations - v_expired_quantity,
           updated_at = p_now
     WHERE offer_id = p_offer_id;
    INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, source, metadata, created_at)
    VALUES (p_offer_id, 'release', v_expired_quantity, 'reservation_expiry', jsonb_build_object('expired_quantity', v_expired_quantity), p_now);
    SELECT * INTO v_balance FROM inventory_balances WHERE offer_id = p_offer_id;
  END IF;

  IF v_balance.active_reservations < 0 THEN RAISE EXCEPTION 'inventory corruption: negative active reservations for offer %', p_offer_id; END IF;

  IF v_authoritative THEN
    v_available := GREATEST(0, v_supplier_quantity - v_balance.active_reservations - v_balance.blocked);
  ELSE
    v_available := GREATEST(0, v_balance.on_hand - v_balance.active_reservations - v_balance.safety_stock - v_balance.blocked);
  END IF;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'insufficient stock for offer % (available %, requested %)', p_offer_id, v_available, p_quantity;
  END IF;

  INSERT INTO stock_reservations (market_id, checkout_key, offer_id, cart_item_id, quantity, status, expires_at, created_at)
  VALUES (p_market_id, p_checkout_key, p_offer_id, p_cart_item_id, p_quantity, 'active', p_expires_at, p_now)
  RETURNING * INTO v_reservation;

  UPDATE inventory_balances
     SET active_reservations = active_reservations + p_quantity,
         updated_at = p_now
   WHERE offer_id = p_offer_id;

  INSERT INTO inventory_movements (offer_id, movement_type, quantity_delta, reservation_id, source, created_at)
  VALUES (p_offer_id, 'reserve', -p_quantity, v_reservation.id, 'checkout', p_now);

  RETURN v_reservation;
END;
$function$;

-- Buy Local Sparta — admin pre-activation catalogue assignment and safe vendor demo mode.
-- Catalogue preparation is intentionally independent from vendor activation.
-- Demo mode is presentation-only and is never commerce eligibility.

BEGIN;

ALTER TABLE public.vendor_businesses
  ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_mode_updated_at timestamptz;

COMMENT ON COLUMN public.vendor_businesses.demo_mode IS
  'Admin-controlled presentation mode. A demo shop may be previewed with assigned catalogue data but must never be selected for live commerce.';

CREATE INDEX IF NOT EXISTS vendor_businesses_demo_mode_idx
  ON public.vendor_businesses(market_id, demo_mode)
  WHERE demo_mode = true;

CREATE OR REPLACE FUNCTION bls_private.guard_vendor_commerce_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_status text;
  v_demo_mode boolean;
BEGIN
  SELECT v.status::text, v.demo_mode
  INTO v_status, v_demo_mode
  FROM public.vendor_businesses v
  WHERE v.id = NEW.vendor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order line vendor does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_status <> 'active' OR v_demo_mode THEN
    RAISE EXCEPTION 'Vendor is not commerce eligible (status %, demo mode %)', v_status, v_demo_mode
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS order_lines_vendor_commerce_eligibility
  ON public.order_lines;

CREATE TRIGGER order_lines_vendor_commerce_eligibility
BEFORE INSERT OR UPDATE OF vendor_id, assigned_offer_id
ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION bls_private.guard_vendor_commerce_eligibility();

COMMIT;

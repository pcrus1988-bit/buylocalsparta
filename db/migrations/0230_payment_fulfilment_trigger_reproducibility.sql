-- KONTA MOY — make production payment/fulfilment gates reproducible.
-- This migration captures the exact payment-gating schema already running in production,
-- including the pending_payment fulfilment state that had previously existed only as live drift.
-- It does not enable Nova supplier writes, automatic supplier payments, or public catalogue activation.

BEGIN;

-- Production already contains this value. Clean databases built only from repository
-- migrations did not, which made the payment gate impossible to reproduce.
ALTER TYPE public.fulfilment_status ADD VALUE IF NOT EXISTS 'pending_payment';

CREATE OR REPLACE FUNCTION public.gate_fulfilment_until_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payment_captured boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = NEW.order_id
      AND p.status = 'captured'
  ) INTO payment_captured;

  IF NEW.status = 'awaiting_acceptance' AND NOT payment_captured THEN
    NEW.status := 'pending_payment';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'pending_payment'
     AND NEW.status NOT IN ('pending_payment', 'cancelled')
     AND NOT payment_captured THEN
    RAISE EXCEPTION 'Cannot make unpaid fulfilment actionable for order %', NEW.order_id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_fulfilment_after_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'captured' THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
      UPDATE public.fulfilment_orders
         SET status = 'awaiting_acceptance',
             updated_at = now()
       WHERE order_id = NEW.order_id
         AND status = 'pending_payment';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_gate_fulfilment_until_payment ON public.fulfilment_orders;
CREATE TRIGGER trg_gate_fulfilment_until_payment
BEFORE INSERT OR UPDATE OF status ON public.fulfilment_orders
FOR EACH ROW
EXECUTE FUNCTION public.gate_fulfilment_until_payment();

DROP TRIGGER IF EXISTS trg_release_fulfilment_after_capture ON public.payments;
CREATE TRIGGER trg_release_fulfilment_after_capture
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.release_fulfilment_after_capture();

REVOKE EXECUTE ON FUNCTION public.gate_fulfilment_until_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_fulfilment_after_capture() FROM PUBLIC;

DO $$
DECLARE
  function_name text;
  role_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.gate_fulfilment_until_payment()',
    'public.release_fulfilment_after_capture()'
  ]
  LOOP
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', function_name, role_name);
      END IF;
    END LOOP;

    FOREACH role_name IN ARRAY ARRAY['service_role', 'bls_app_runtime', 'bls_platform_runtime']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', function_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END
$$;

COMMIT;

-- Harden SLA notification trigger functions after deployment.
BEGIN;

ALTER FUNCTION public.suppress_duplicate_admin_order_received()
  SET search_path = public;

ALTER FUNCTION public.mirror_vendor_order_received_to_admin()
  SET search_path = public;

COMMIT;

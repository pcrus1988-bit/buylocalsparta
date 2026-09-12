-- KONTA MOY — harden fulfilment payment trigger function privileges.
-- These SECURITY DEFINER functions are invoked by database triggers, not directly by public API roles.
-- Keep trigger behavior unchanged while removing inherited direct EXECUTE from customer-facing roles.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.gate_fulfilment_until_payment()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.release_fulfilment_after_capture()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gate_fulfilment_until_payment()
  TO service_role, bls_app_runtime, bls_platform_runtime;

GRANT EXECUTE ON FUNCTION public.release_fulfilment_after_capture()
  TO service_role, bls_app_runtime, bls_platform_runtime;

COMMIT;

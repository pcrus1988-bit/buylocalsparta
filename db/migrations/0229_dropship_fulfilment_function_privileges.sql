-- KONTA MOY — harden fulfilment payment trigger function privileges.
-- These SECURITY DEFINER functions are invoked by database triggers, not directly by public API roles.
-- Keep trigger behavior unchanged while removing inherited direct EXECUTE from customer-facing roles.
-- The functions exist in production but are not part of every clean historical test fixture, so guards
-- keep forward-only migrations reproducible across those fixtures without creating or changing functions.

BEGIN;

DO $$
DECLARE
  function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.gate_fulfilment_until_payment()',
    'public.release_fulfilment_after_capture()'
  ]
  LOOP
    IF to_regprocedure(function_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_name);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_name);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', function_name);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_name);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bls_app_runtime') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO bls_app_runtime', function_name);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bls_platform_runtime') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO bls_platform_runtime', function_name);
    END IF;
  END LOOP;
END
$$;

COMMIT;

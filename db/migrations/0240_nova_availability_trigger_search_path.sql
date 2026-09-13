-- KONTA MOY — harden NOVA availability TTL trigger execution context.
-- The trigger already fully qualifies marketplace relations; pinning search_path
-- prevents caller-controlled schema resolution without changing TTL behaviour.

BEGIN;

ALTER FUNCTION public.enforce_nova_availability_ttl_0232()
  SET search_path = pg_catalog, public;

COMMIT;

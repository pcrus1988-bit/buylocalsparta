-- KONTA MOY — harden private NOVA/BAZAAR classifier execution context.
-- These functions classify supplier items into normal vs BAZAAR commerce channels
-- and condition labels. Pinning search_path removes mutable object-resolution risk
-- without changing classification behavior.

BEGIN;

ALTER FUNCTION bls_private.catalog_nova_condition_label(jsonb)
  SET search_path = '';

ALTER FUNCTION bls_private.catalog_nova_commerce_channel(jsonb)
  SET search_path = '';

COMMIT;

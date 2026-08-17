-- Buy Local Sparta — credential-bound platform authorization for application RLS.
-- Platform access is granted only to sessions whose login role is a member of
-- bls_platform_runtime. Transaction/session variables cannot grant platform access.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bls_app_runtime') THEN
    CREATE ROLE bls_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bls_platform_runtime') THEN
    CREATE ROLE bls_platform_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS bls_private;
REVOKE ALL ON SCHEMA bls_private FROM PUBLIC;
GRANT USAGE ON SCHEMA bls_private TO anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.is_platform_runtime()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_has_role(session_user, 'bls_platform_runtime', 'member');
$$;

REVOKE ALL ON FUNCTION bls_private.is_platform_runtime() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.is_platform_runtime()
  TO anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

COMMENT ON FUNCTION bls_private.is_platform_runtime() IS
  'Returns true only for a credential-bound member of bls_platform_runtime; never trusts client-set session variables.';

DROP POLICY IF EXISTS vendor_offer_scope ON vendor_offers;
CREATE POLICY vendor_offer_scope ON vendor_offers
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS inventory_vendor_scope ON inventory_balances;
CREATE POLICY inventory_vendor_scope ON inventory_balances
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM vendor_offers vo
      WHERE vo.id = inventory_balances.offer_id
        AND vo.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    )
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR EXISTS (
      SELECT 1 FROM vendor_offers vo
      WHERE vo.id = inventory_balances.offer_id
        AND vo.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS fulfilment_vendor_scope ON fulfilment_orders;
CREATE POLICY fulfilment_vendor_scope ON fulfilment_orders
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS procurement_vendor_scope ON procurements;
CREATE POLICY procurement_vendor_scope ON procurements
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS settlement_vendor_scope ON settlement_lines;
DROP POLICY IF EXISTS settlement_lines_vendor_scope ON settlement_lines;
CREATE POLICY settlement_vendor_scope ON settlement_lines
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS conversation_vendor_scope ON conversations;
CREATE POLICY conversation_vendor_scope ON conversations
  USING (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  )
  WITH CHECK (
    (SELECT bls_private.is_platform_runtime())
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

-- Buy Local Sparta — explicit platform bypass inside application RLS policies.
-- The application must set app.platform_access=true only after platform-role authorization.
-- Vendor traffic continues to be scoped by app.vendor_id.

DROP POLICY IF EXISTS vendor_offer_scope ON vendor_offers;
CREATE POLICY vendor_offer_scope ON vendor_offers
  USING (
    current_setting('app.platform_access', true) = 'true'
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS inventory_vendor_scope ON inventory_balances;
CREATE POLICY inventory_vendor_scope ON inventory_balances
  USING (
    current_setting('app.platform_access', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM vendor_offers vo
      WHERE vo.id = inventory_balances.offer_id
        AND vo.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS fulfilment_vendor_scope ON fulfilment_orders;
CREATE POLICY fulfilment_vendor_scope ON fulfilment_orders
  USING (
    current_setting('app.platform_access', true) = 'true'
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS procurement_vendor_scope ON procurements;
CREATE POLICY procurement_vendor_scope ON procurements
  USING (
    current_setting('app.platform_access', true) = 'true'
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS settlement_vendor_scope ON settlement_lines;
DROP POLICY IF EXISTS settlement_lines_vendor_scope ON settlement_lines;
CREATE POLICY settlement_vendor_scope ON settlement_lines
  USING (
    current_setting('app.platform_access', true) = 'true'
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

DROP POLICY IF EXISTS conversation_vendor_scope ON conversations;
CREATE POLICY conversation_vendor_scope ON conversations
  USING (
    current_setting('app.platform_access', true) = 'true'
    OR vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

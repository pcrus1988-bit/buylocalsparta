-- Buy Local Sparta — reusable customer billing/delivery addresses and immutable order snapshots.
BEGIN;

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS is_default_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_default_delivery boolean NOT NULL DEFAULT false;

-- Existing customers with saved addresses receive a deterministic first default so the
-- new checkout can preselect an address without changing any historical order snapshot.
WITH ranked AS (
  SELECT id,user_id,row_number() OVER (PARTITION BY user_id ORDER BY created_at,id) AS rn
  FROM addresses
  WHERE user_id IS NOT NULL
), chosen AS (
  SELECT id FROM ranked WHERE rn=1
)
UPDATE addresses a
SET is_default_billing=true,is_default_delivery=true
FROM chosen c
WHERE a.id=c.id
  AND NOT EXISTS (SELECT 1 FROM addresses x WHERE x.user_id=a.user_id AND x.is_default_billing=true)
  AND NOT EXISTS (SELECT 1 FROM addresses x WHERE x.user_id=a.user_id AND x.is_default_delivery=true);

CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_billing_per_user_uidx
  ON addresses(user_id) WHERE user_id IS NOT NULL AND is_default_billing=true;
CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_delivery_per_user_uidx
  ON addresses(user_id) WHERE user_id IS NOT NULL AND is_default_delivery=true;
CREATE INDEX IF NOT EXISTS addresses_user_defaults_idx
  ON addresses(user_id,is_default_billing DESC,is_default_delivery DESC,updated_at DESC);

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS checkout_address_locked_at timestamptz;

COMMENT ON COLUMN customer_orders.checkout_address_locked_at IS
  'Set when the customer name, billing address and delivery address snapshots are attached. Once set, checkout code must treat both snapshots as immutable.';
COMMENT ON COLUMN addresses.is_default_billing IS 'Customer-selected reusable default billing/invoice address.';
COMMENT ON COLUMN addresses.is_default_delivery IS 'Customer-selected reusable default delivery address.';

COMMIT;

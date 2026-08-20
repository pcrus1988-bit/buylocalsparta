-- Human-readable public references for customer/vendor/admin workflows.
-- Technical UUID/public_id values remain unchanged and continue to be used internally.
BEGIN;

CREATE SEQUENCE IF NOT EXISTS public_order_reference_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS public_ask_reference_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS public_ticket_reference_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS public_return_reference_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS public_refund_reference_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS public_claim_reference_seq START WITH 10001;
CREATE SEQUENCE IF NOT EXISTS public_privacy_reference_seq START WITH 10001;

WITH ranked AS (
  SELECT id, 10000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM customer_orders
)
UPDATE customer_orders o
SET order_number = 'ORD-' || lpad(r.n::text, 5, '0')
FROM ranked r
WHERE o.id = r.id;
SELECT setval('public_order_reference_seq',
  GREATEST(10000, COALESCE((SELECT max(substring(order_number from '([0-9]+)$')::bigint) FROM customer_orders), 10000)),
  true);
ALTER TABLE customer_orders
  ALTER COLUMN order_number SET DEFAULT ('ORD-' || lpad(nextval('public_order_reference_seq')::text, 5, '0'));
ALTER TABLE customer_orders DROP CONSTRAINT IF EXISTS customer_orders_order_number_public_format;
ALTER TABLE customer_orders ADD CONSTRAINT customer_orders_order_number_public_format CHECK (order_number ~ '^ORD-[0-9]{5,}$');

CREATE OR REPLACE FUNCTION bls_private.assign_order_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number !~ '^ORD-[0-9]{5,}$' THEN
    NEW.order_number := 'ORD-' || lpad(nextval('public_order_reference_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS customer_orders_assign_public_reference ON customer_orders;
CREATE TRIGGER customer_orders_assign_public_reference
BEFORE INSERT ON customer_orders
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_order_reference();

ALTER TABLE counteroffer_requests ADD COLUMN IF NOT EXISTS reference_number text;
WITH ranked AS (
  SELECT id, 10000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM counteroffer_requests
)
UPDATE counteroffer_requests r
SET reference_number = 'ASK-' || lpad(x.n::text, 5, '0')
FROM ranked x
WHERE r.id=x.id AND r.reference_number IS NULL;
SELECT setval('public_ask_reference_seq',
  GREATEST(10000, COALESCE((SELECT max(substring(reference_number from '([0-9]+)$')::bigint) FROM counteroffer_requests), 10000)),
  true);
ALTER TABLE counteroffer_requests
  ALTER COLUMN reference_number SET DEFAULT ('ASK-' || lpad(nextval('public_ask_reference_seq')::text, 5, '0')),
  ALTER COLUMN reference_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS counteroffer_requests_reference_number_uidx ON counteroffer_requests(reference_number);

ALTER TABLE customer_support_cases ADD COLUMN IF NOT EXISTS reference_number text;
WITH ranked AS (
  SELECT id, 10000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM customer_support_cases
)
UPDATE customer_support_cases c
SET reference_number = 'TKT-' || lpad(x.n::text, 5, '0')
FROM ranked x
WHERE c.id=x.id AND c.reference_number IS NULL;
SELECT setval('public_ticket_reference_seq',
  GREATEST(10000, COALESCE((SELECT max(substring(reference_number from '([0-9]+)$')::bigint) FROM customer_support_cases), 10000)),
  true);
ALTER TABLE customer_support_cases
  ALTER COLUMN reference_number SET DEFAULT ('TKT-' || lpad(nextval('public_ticket_reference_seq')::text, 5, '0')),
  ALTER COLUMN reference_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_support_cases_reference_number_uidx ON customer_support_cases(reference_number);

WITH ranked AS (
  SELECT id, 10000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM returns
)
UPDATE returns r
SET return_number = 'RET-' || lpad(x.n::text, 5, '0')
FROM ranked x
WHERE r.id=x.id;
SELECT setval('public_return_reference_seq',
  GREATEST(10000, COALESCE((SELECT max(substring(return_number from '([0-9]+)$')::bigint) FROM returns), 10000)),
  true);
ALTER TABLE returns
  ALTER COLUMN return_number SET DEFAULT ('RET-' || lpad(nextval('public_return_reference_seq')::text, 5, '0'));
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_return_number_public_format;
ALTER TABLE returns ADD CONSTRAINT returns_return_number_public_format CHECK (return_number ~ '^RET-[0-9]{5,}$');

CREATE OR REPLACE FUNCTION bls_private.assign_return_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  IF NEW.return_number IS NULL OR NEW.return_number !~ '^RET-[0-9]{5,}$' THEN
    NEW.return_number := 'RET-' || lpad(nextval('public_return_reference_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS returns_assign_public_reference ON returns;
CREATE TRIGGER returns_assign_public_reference
BEFORE INSERT ON returns
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_return_reference();

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reference_number text;
WITH ranked AS (
  SELECT id, 10000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM refunds
)
UPDATE refunds r
SET reference_number = 'RFD-' || lpad(x.n::text, 5, '0')
FROM ranked x
WHERE r.id=x.id AND r.reference_number IS NULL;
SELECT setval('public_refund_reference_seq',
  GREATEST(10000, COALESCE((SELECT max(substring(reference_number from '([0-9]+)$')::bigint) FROM refunds), 10000)),
  true);
ALTER TABLE refunds
  ALTER COLUMN reference_number SET DEFAULT ('RFD-' || lpad(nextval('public_refund_reference_seq')::text, 5, '0')),
  ALTER COLUMN reference_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS refunds_reference_number_uidx ON refunds(reference_number);

ALTER TABLE payment_disputes ADD COLUMN IF NOT EXISTS reference_number text;
WITH ranked AS (
  SELECT id, 10000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM payment_disputes
)
UPDATE payment_disputes d
SET reference_number = 'CLM-' || lpad(x.n::text, 5, '0')
FROM ranked x
WHERE d.id=x.id AND d.reference_number IS NULL;
SELECT setval('public_claim_reference_seq',
  GREATEST(10000, COALESCE((SELECT max(substring(reference_number from '([0-9]+)$')::bigint) FROM payment_disputes), 10000)),
  true);
ALTER TABLE payment_disputes
  ALTER COLUMN reference_number SET DEFAULT ('CLM-' || lpad(nextval('public_claim_reference_seq')::text, 5, '0')),
  ALTER COLUMN reference_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_disputes_reference_number_uidx ON payment_disputes(reference_number);

ALTER TABLE privacy_requests ADD COLUMN IF NOT EXISTS reference_number text;
WITH ranked AS (
  SELECT id, 10000 + row_number() OVER (ORDER BY created_at, id) AS n
  FROM privacy_requests
)
UPDATE privacy_requests p
SET reference_number = 'PRV-' || lpad(x.n::text, 5, '0')
FROM ranked x
WHERE p.id=x.id AND p.reference_number IS NULL;
SELECT setval('public_privacy_reference_seq',
  GREATEST(10000, COALESCE((SELECT max(substring(reference_number from '([0-9]+)$')::bigint) FROM privacy_requests), 10000)),
  true);
ALTER TABLE privacy_requests
  ALTER COLUMN reference_number SET DEFAULT ('PRV-' || lpad(nextval('public_privacy_reference_seq')::text, 5, '0')),
  ALTER COLUMN reference_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS privacy_requests_reference_number_uidx ON privacy_requests(reference_number);

COMMIT;

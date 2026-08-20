-- Human-facing marketplace references.
-- Technical UUID/public_id values remain unchanged and continue to drive joins, routing,
-- idempotency and audit evidence. These short references are for people and documents.
BEGIN;

CREATE TABLE IF NOT EXISTS public_reference_counters (
  kind text PRIMARY KEY,
  prefix text NOT NULL UNIQUE,
  next_value bigint NOT NULL CHECK (next_value >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public_reference_counters(kind,prefix,next_value) VALUES
  ('order','ORD',10001),
  ('ask_local','ASK',10001),
  ('support','TKT',10001),
  ('return','RET',10001),
  ('refund','RFD',10001),
  ('claim','CLM',10001),
  ('privacy','PRV',10001)
ON CONFLICT (kind) DO NOTHING;

CREATE OR REPLACE FUNCTION bls_private.next_public_reference(p_kind text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $function$
DECLARE
  v_prefix text;
  v_value bigint;
BEGIN
  UPDATE public_reference_counters
  SET next_value = next_value + 1,
      updated_at = now()
  WHERE kind = p_kind
  RETURNING prefix, next_value - 1 INTO v_prefix, v_value;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown public reference kind: %', p_kind;
  END IF;

  RETURN v_prefix || '-' || lpad(v_value::text, 5, '0');
END;
$function$;

REVOKE ALL ON FUNCTION bls_private.next_public_reference(text) FROM PUBLIC;

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS legacy_order_number text;

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS legacy_return_number text;

ALTER TABLE counteroffer_requests
  ADD COLUMN IF NOT EXISTS reference_number text;

ALTER TABLE customer_support_cases
  ADD COLUMN IF NOT EXISTS reference_number text;

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS reference_number text;

ALTER TABLE payment_disputes
  ADD COLUMN IF NOT EXISTS reference_number text;

ALTER TABLE privacy_requests
  ADD COLUMN IF NOT EXISTS reference_number text;

-- Preserve historical business numbers before normalising existing rows.
UPDATE customer_orders
SET legacy_order_number = order_number
WHERE legacy_order_number IS NULL
  AND order_number IS NOT NULL
  AND order_number !~ '^ORD-[0-9]{5,}$';

UPDATE returns
SET legacy_return_number = return_number
WHERE legacy_return_number IS NULL
  AND return_number IS NOT NULL
  AND return_number !~ '^RET-[0-9]{5,}$';

-- Deterministic backfill by creation order. The long technical public_id remains untouched.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM customer_orders
)
UPDATE customer_orders o
SET order_number = 'ORD-' || lpad((10000 + ranked.n)::text, 5, '0')
FROM ranked
WHERE o.id = ranked.id
  AND o.order_number !~ '^ORD-[0-9]{5,}$';

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM counteroffer_requests
)
UPDATE counteroffer_requests r
SET reference_number = 'ASK-' || lpad((10000 + ranked.n)::text, 5, '0')
FROM ranked
WHERE r.id = ranked.id
  AND r.reference_number IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM customer_support_cases
)
UPDATE customer_support_cases c
SET reference_number = 'TKT-' || lpad((10000 + ranked.n)::text, 5, '0')
FROM ranked
WHERE c.id = ranked.id
  AND c.reference_number IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM returns
)
UPDATE returns r
SET return_number = 'RET-' || lpad((10000 + ranked.n)::text, 5, '0')
FROM ranked
WHERE r.id = ranked.id
  AND r.return_number !~ '^RET-[0-9]{5,}$';

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM refunds
)
UPDATE refunds r
SET reference_number = 'RFD-' || lpad((10000 + ranked.n)::text, 5, '0')
FROM ranked
WHERE r.id = ranked.id
  AND r.reference_number IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM payment_disputes
)
UPDATE payment_disputes d
SET reference_number = 'CLM-' || lpad((10000 + ranked.n)::text, 5, '0')
FROM ranked
WHERE d.id = ranked.id
  AND d.reference_number IS NULL;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM privacy_requests
)
UPDATE privacy_requests p
SET reference_number = 'PRV-' || lpad((10000 + ranked.n)::text, 5, '0')
FROM ranked
WHERE p.id = ranked.id
  AND p.reference_number IS NULL;

-- Advance counters beyond the deterministic backfill.
UPDATE public_reference_counters
SET next_value = CASE kind
  WHEN 'order' THEN 10001 + (SELECT count(*) FROM customer_orders)
  WHEN 'ask_local' THEN 10001 + (SELECT count(*) FROM counteroffer_requests)
  WHEN 'support' THEN 10001 + (SELECT count(*) FROM customer_support_cases)
  WHEN 'return' THEN 10001 + (SELECT count(*) FROM returns)
  WHEN 'refund' THEN 10001 + (SELECT count(*) FROM refunds)
  WHEN 'claim' THEN 10001 + (SELECT count(*) FROM payment_disputes)
  WHEN 'privacy' THEN 10001 + (SELECT count(*) FROM privacy_requests)
  ELSE next_value
END,
updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS counteroffer_requests_reference_number_uidx
  ON counteroffer_requests(reference_number);
CREATE UNIQUE INDEX IF NOT EXISTS customer_support_cases_reference_number_uidx
  ON customer_support_cases(reference_number);
CREATE UNIQUE INDEX IF NOT EXISTS refunds_reference_number_uidx
  ON refunds(reference_number);
CREATE UNIQUE INDEX IF NOT EXISTS payment_disputes_reference_number_uidx
  ON payment_disputes(reference_number);
CREATE UNIQUE INDEX IF NOT EXISTS privacy_requests_reference_number_uidx
  ON privacy_requests(reference_number);

ALTER TABLE counteroffer_requests ALTER COLUMN reference_number SET NOT NULL;
ALTER TABLE customer_support_cases ALTER COLUMN reference_number SET NOT NULL;
ALTER TABLE refunds ALTER COLUMN reference_number SET NOT NULL;
ALTER TABLE payment_disputes ALTER COLUMN reference_number SET NOT NULL;
ALTER TABLE privacy_requests ALTER COLUMN reference_number SET NOT NULL;

CREATE OR REPLACE FUNCTION bls_private.assign_marketplace_public_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $function$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'customer_orders' THEN
      IF NEW.order_number IS NULL OR NEW.order_number !~ '^ORD-[0-9]{5,}$' THEN
        IF NEW.legacy_order_number IS NULL AND NEW.order_number IS NOT NULL THEN
          NEW.legacy_order_number := NEW.order_number;
        END IF;
        NEW.order_number := bls_private.next_public_reference('order');
      END IF;
    WHEN 'counteroffer_requests' THEN
      IF NEW.reference_number IS NULL OR NEW.reference_number !~ '^ASK-[0-9]{5,}$' THEN
        NEW.reference_number := bls_private.next_public_reference('ask_local');
      END IF;
    WHEN 'customer_support_cases' THEN
      IF NEW.reference_number IS NULL OR NEW.reference_number !~ '^TKT-[0-9]{5,}$' THEN
        NEW.reference_number := bls_private.next_public_reference('support');
      END IF;
    WHEN 'returns' THEN
      IF NEW.return_number IS NULL OR NEW.return_number !~ '^RET-[0-9]{5,}$' THEN
        IF NEW.legacy_return_number IS NULL AND NEW.return_number IS NOT NULL THEN
          NEW.legacy_return_number := NEW.return_number;
        END IF;
        NEW.return_number := bls_private.next_public_reference('return');
      END IF;
    WHEN 'refunds' THEN
      IF NEW.reference_number IS NULL OR NEW.reference_number !~ '^RFD-[0-9]{5,}$' THEN
        NEW.reference_number := bls_private.next_public_reference('refund');
      END IF;
    WHEN 'payment_disputes' THEN
      IF NEW.reference_number IS NULL OR NEW.reference_number !~ '^CLM-[0-9]{5,}$' THEN
        NEW.reference_number := bls_private.next_public_reference('claim');
      END IF;
    WHEN 'privacy_requests' THEN
      IF NEW.reference_number IS NULL OR NEW.reference_number !~ '^PRV-[0-9]{5,}$' THEN
        NEW.reference_number := bls_private.next_public_reference('privacy');
      END IF;
  END CASE;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customer_orders_public_reference ON customer_orders;
CREATE TRIGGER customer_orders_public_reference
BEFORE INSERT ON customer_orders
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_marketplace_public_reference();

DROP TRIGGER IF EXISTS counteroffer_requests_public_reference ON counteroffer_requests;
CREATE TRIGGER counteroffer_requests_public_reference
BEFORE INSERT ON counteroffer_requests
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_marketplace_public_reference();

DROP TRIGGER IF EXISTS customer_support_cases_public_reference ON customer_support_cases;
CREATE TRIGGER customer_support_cases_public_reference
BEFORE INSERT ON customer_support_cases
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_marketplace_public_reference();

DROP TRIGGER IF EXISTS returns_public_reference ON returns;
CREATE TRIGGER returns_public_reference
BEFORE INSERT ON returns
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_marketplace_public_reference();

DROP TRIGGER IF EXISTS refunds_public_reference ON refunds;
CREATE TRIGGER refunds_public_reference
BEFORE INSERT ON refunds
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_marketplace_public_reference();

DROP TRIGGER IF EXISTS payment_disputes_public_reference ON payment_disputes;
CREATE TRIGGER payment_disputes_public_reference
BEFORE INSERT ON payment_disputes
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_marketplace_public_reference();

DROP TRIGGER IF EXISTS privacy_requests_public_reference ON privacy_requests;
CREATE TRIGGER privacy_requests_public_reference
BEFORE INSERT ON privacy_requests
FOR EACH ROW EXECUTE FUNCTION bls_private.assign_marketplace_public_reference();

CREATE OR REPLACE FUNCTION bls_private.resolve_marketplace_public_reference(
  p_kind text,
  p_identifier text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $function$
DECLARE
  v_reference text;
BEGIN
  IF p_identifier IS NULL OR btrim(p_identifier) = '' THEN
    RETURN NULL;
  END IF;

  CASE p_kind
    WHEN 'order' THEN
      SELECT order_number INTO v_reference
      FROM customer_orders
      WHERE public_id = p_identifier OR id::text = p_identifier OR order_number = p_identifier
      LIMIT 1;
    WHEN 'ask_local' THEN
      SELECT reference_number INTO v_reference
      FROM counteroffer_requests
      WHERE public_id = p_identifier OR id::text = p_identifier OR reference_number = p_identifier
      LIMIT 1;
    WHEN 'support' THEN
      SELECT reference_number INTO v_reference
      FROM customer_support_cases
      WHERE public_id = p_identifier OR id::text = p_identifier OR reference_number = p_identifier
      LIMIT 1;
    WHEN 'return' THEN
      SELECT return_number INTO v_reference
      FROM returns
      WHERE public_id = p_identifier OR id::text = p_identifier OR return_number = p_identifier
      LIMIT 1;
    WHEN 'refund' THEN
      SELECT reference_number INTO v_reference
      FROM refunds
      WHERE public_id = p_identifier OR id::text = p_identifier OR reference_number = p_identifier
      LIMIT 1;
    WHEN 'claim' THEN
      SELECT reference_number INTO v_reference
      FROM payment_disputes
      WHERE public_id = p_identifier OR id::text = p_identifier OR reference_number = p_identifier
      LIMIT 1;
    WHEN 'privacy' THEN
      SELECT reference_number INTO v_reference
      FROM privacy_requests
      WHERE public_id = p_identifier OR id::text = p_identifier OR reference_number = p_identifier
      LIMIT 1;
    ELSE
      RETURN NULL;
  END CASE;

  RETURN COALESCE(v_reference, p_identifier);
END;
$function$;

REVOKE ALL ON FUNCTION bls_private.resolve_marketplace_public_reference(text,text) FROM PUBLIC;

-- Ensure notification/email workers receive the human reference even when callers still
-- use the technical identifier in payloads. Existing technical ids remain in payload keys.
CREATE OR REPLACE FUNCTION bls_private.decorate_notification_public_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $function$
DECLARE
  v_identifier text;
  v_reference text;
BEGIN
  IF NEW.payload IS NULL OR jsonb_typeof(NEW.payload) <> 'object' THEN
    RETURN NEW;
  END IF;

  v_identifier := NEW.payload->>'orderId';
  IF v_identifier IS NOT NULL THEN
    v_reference := bls_private.resolve_marketplace_public_reference('order', v_identifier);
    IF v_reference IS NOT NULL THEN
      NEW.payload := jsonb_set(NEW.payload, '{orderReference}', to_jsonb(v_reference), true);
      NEW.title := replace(COALESCE(NEW.title,''), v_identifier, v_reference);
      NEW.body := replace(COALESCE(NEW.body,''), v_identifier, v_reference);
    END IF;
  END IF;

  v_identifier := NEW.payload->>'returnId';
  IF v_identifier IS NOT NULL THEN
    v_reference := bls_private.resolve_marketplace_public_reference('return', v_identifier);
    IF v_reference IS NOT NULL THEN
      NEW.payload := jsonb_set(NEW.payload, '{returnReference}', to_jsonb(v_reference), true);
      NEW.title := replace(COALESCE(NEW.title,''), v_identifier, v_reference);
      NEW.body := replace(COALESCE(NEW.body,''), v_identifier, v_reference);
    END IF;
  END IF;

  v_identifier := NEW.payload->>'requestId';
  IF v_identifier IS NOT NULL THEN
    v_reference := bls_private.resolve_marketplace_public_reference('ask_local', v_identifier);
    IF v_reference IS NOT NULL AND v_reference <> v_identifier THEN
      NEW.payload := jsonb_set(NEW.payload, '{requestReference}', to_jsonb(v_reference), true);
      NEW.title := replace(COALESCE(NEW.title,''), v_identifier, v_reference);
      NEW.body := replace(COALESCE(NEW.body,''), v_identifier, v_reference);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notifications_public_references ON notifications;
CREATE TRIGGER notifications_public_references
BEFORE INSERT OR UPDATE OF payload, title, body ON notifications
FOR EACH ROW EXECUTE FUNCTION bls_private.decorate_notification_public_references();

-- Backfill existing notifications through the same compatibility trigger.
UPDATE notifications
SET payload = payload
WHERE payload ?| ARRAY['orderId','returnId','requestId'];

REVOKE ALL ON TABLE public_reference_counters
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT ON TABLE public_reference_counters TO bls_platform_runtime;

COMMENT ON TABLE public_reference_counters IS
  'Independent human-reference counters. Technical UUID/public_id identifiers remain authoritative and are never replaced.';
COMMENT ON COLUMN customer_orders.order_number IS
  'Human-facing order reference (ORD-xxxxx). customer_orders.public_id remains the technical identifier.';
COMMENT ON COLUMN counteroffer_requests.reference_number IS
  'Human-facing Ask Local reference (ASK-xxxxx). public_id remains technical.';
COMMENT ON COLUMN customer_support_cases.reference_number IS
  'Human-facing support ticket reference (TKT-xxxxx). public_id remains technical.';
COMMENT ON COLUMN returns.return_number IS
  'Human-facing return reference (RET-xxxxx). public_id remains technical.';
COMMENT ON COLUMN refunds.reference_number IS
  'Human-facing refund reference (RFD-xxxxx). public_id remains technical.';
COMMENT ON COLUMN payment_disputes.reference_number IS
  'Human-facing claim/dispute reference (CLM-xxxxx). public_id remains technical.';
COMMENT ON COLUMN privacy_requests.reference_number IS
  'Human-facing privacy request reference (PRV-xxxxx). public_id remains technical.';

COMMIT;

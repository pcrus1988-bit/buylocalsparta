-- KONTA MOU / Buy Local Sparta — customer-safe contextual support bridge.
-- Existing support history remains internal by default. Only events explicitly marked
-- customer_visible may be projected into the customer account experience.

BEGIN;

ALTER TABLE customer_support_cases
  ADD COLUMN IF NOT EXISTS context_type text,
  ADD COLUMN IF NOT EXISTS context_public_id text;

ALTER TABLE customer_support_cases
  DROP CONSTRAINT IF EXISTS customer_support_cases_context_type_check;
ALTER TABLE customer_support_cases
  ADD CONSTRAINT customer_support_cases_context_type_check
  CHECK (context_type IS NULL OR context_type IN ('account','security','order','ask_local','return','privacy','saved','other'));

ALTER TABLE customer_support_cases
  DROP CONSTRAINT IF EXISTS customer_support_cases_context_pair_check;
ALTER TABLE customer_support_cases
  ADD CONSTRAINT customer_support_cases_context_pair_check
  CHECK (
    (context_type IS NULL AND context_public_id IS NULL)
    OR (
      context_type IS NOT NULL
      AND (
        (context_type IN ('order','ask_local','return','privacy') AND context_public_id IS NOT NULL AND char_length(context_public_id) BETWEEN 3 AND 200)
        OR (context_type IN ('account','security','saved','other') AND context_public_id IS NULL)
      )
    )
  );

ALTER TABLE customer_support_case_events
  ADD COLUMN IF NOT EXISTS customer_visible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS customer_support_cases_customer_context_idx
  ON customer_support_cases (customer_user_id, context_type, context_public_id, updated_at DESC);

COMMENT ON COLUMN customer_support_cases.context_type IS
  'Optional customer-facing context class. Context ownership is validated by the application before case creation.';
COMMENT ON COLUMN customer_support_cases.context_public_id IS
  'Optional public marketplace reference for the validated customer-owned order, Ask Local request, return or privacy request.';
COMMENT ON COLUMN customer_support_case_events.customer_visible IS
  'False by default so historical/internal notes never become customer-visible accidentally. Only explicit customer messages or Admin replies may set true.';

COMMIT;

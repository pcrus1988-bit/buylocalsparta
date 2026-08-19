-- KONTA MOY / Buy Local Sparta — governed customer support cases.
-- Customer support records are operational data, separate from immutable audit evidence.
-- They are platform-only and never exposed to customer/vendor runtimes.

CREATE TABLE customer_support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  market_id uuid NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  category text NOT NULL CHECK (category IN ('account','order','payment','return','delivery','privacy','technical','other')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting_customer','waiting_internal','resolved','closed')),
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_public_id text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_public_id text NOT NULL,
  follow_up_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(subject) BETWEEN 3 AND 240),
  CHECK (char_length(created_by_public_id) BETWEEN 3 AND 160),
  CHECK (assigned_to_public_id IS NULL OR char_length(assigned_to_public_id) BETWEEN 3 AND 160)
);

CREATE TABLE customer_support_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  case_id uuid NOT NULL REFERENCES customer_support_cases(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_public_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created','note_added','status_changed','priority_changed','assigned','follow_up_changed'
  )),
  note text,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(actor_public_id) BETWEEN 3 AND 160),
  CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 4000)
);

CREATE INDEX customer_support_cases_customer_idx
  ON customer_support_cases (customer_user_id, updated_at DESC);
CREATE INDEX customer_support_cases_queue_idx
  ON customer_support_cases (status, priority, follow_up_at, updated_at DESC);
CREATE INDEX customer_support_cases_assignee_idx
  ON customer_support_cases (assigned_to_user_id, status, updated_at DESC);
CREATE INDEX customer_support_case_events_case_idx
  ON customer_support_case_events (case_id, created_at DESC);

ALTER TABLE customer_support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_support_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_support_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_support_case_events FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_support_cases_platform_read
  ON customer_support_cases FOR SELECT
  USING ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY customer_support_cases_platform_insert
  ON customer_support_cases FOR INSERT
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY customer_support_cases_platform_update
  ON customer_support_cases FOR UPDATE
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY customer_support_case_events_platform_read
  ON customer_support_case_events FOR SELECT
  USING ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY customer_support_case_events_platform_insert
  ON customer_support_case_events FOR INSERT
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT, INSERT, UPDATE ON customer_support_cases TO bls_platform_runtime;
GRANT SELECT, INSERT ON customer_support_case_events TO bls_platform_runtime;
REVOKE ALL ON customer_support_cases, customer_support_case_events FROM anon, authenticated;

COMMENT ON TABLE customer_support_cases IS
  'Platform-only operational customer support cases. PII remains in canonical customer records; notes should contain only support-relevant context.';
COMMENT ON TABLE customer_support_case_events IS
  'Append-only event/note history for customer support cases; immutable audit evidence remains in audit_events.';

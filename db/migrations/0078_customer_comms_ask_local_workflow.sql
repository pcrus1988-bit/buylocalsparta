BEGIN;

ALTER TABLE counteroffer_requests
  ADD COLUMN IF NOT EXISTS workflow_owner_kind text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS assigned_admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_reason text,
  ADD COLUMN IF NOT EXISTS workflow_updated_at timestamptz NOT NULL DEFAULT now();

UPDATE counteroffer_requests
SET workflow_owner_kind = CASE WHEN assigned_vendor_id IS NOT NULL THEN 'vendor' ELSE 'admin' END,
    assignment_reason = COALESCE(assignment_reason, 'legacy_backfill'),
    workflow_updated_at = COALESCE(updated_at, created_at, now())
WHERE assignment_reason IS NULL
   OR workflow_owner_kind IS DISTINCT FROM CASE WHEN assigned_vendor_id IS NOT NULL THEN 'vendor' ELSE 'admin' END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'counteroffer_requests_workflow_owner_kind_check'
  ) THEN
    ALTER TABLE counteroffer_requests
      ADD CONSTRAINT counteroffer_requests_workflow_owner_kind_check
      CHECK (workflow_owner_kind IN ('admin', 'vendor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'counteroffer_requests_vendor_owner_check'
  ) THEN
    ALTER TABLE counteroffer_requests
      ADD CONSTRAINT counteroffer_requests_vendor_owner_check
      CHECK (workflow_owner_kind <> 'vendor' OR assigned_vendor_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS counteroffer_requests_workflow_queue_idx
  ON counteroffer_requests (workflow_owner_kind, status, created_at DESC);

CREATE INDEX IF NOT EXISTS counteroffer_requests_assigned_admin_idx
  ON counteroffer_requests (assigned_admin_user_id, status, created_at DESC)
  WHERE assigned_admin_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_customer_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL,
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sending', 'sent', 'cancelled')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  drafted_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  sent_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  sent_at timestamptz,
  provider_message_id text,
  last_delivery_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status IN ('draft', 'cancelled')
    OR (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CHECK (
    status <> 'sent'
    OR (sent_by_user_id IS NOT NULL AND sent_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS admin_customer_email_messages_customer_idx
  ON admin_customer_email_messages (customer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_customer_email_messages_pending_idx
  ON admin_customer_email_messages (status, updated_at DESC)
  WHERE status IN ('draft', 'approved', 'sending');

CREATE OR REPLACE FUNCTION enforce_admin_customer_email_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  content_changed boolean;
BEGIN
  content_changed := OLD.recipient_email IS DISTINCT FROM NEW.recipient_email
    OR OLD.subject IS DISTINCT FROM NEW.subject
    OR OLD.body IS DISTINCT FROM NEW.body;

  IF OLD.status = 'sent' AND content_changed THEN
    RAISE EXCEPTION 'Sent customer email messages are immutable';
  END IF;

  IF content_changed THEN
    NEW.revision := OLD.revision + 1;
    NEW.approved_by_user_id := NULL;
    NEW.approved_at := NULL;
    NEW.sent_by_user_id := NULL;
    NEW.sent_at := NULL;
    NEW.provider_message_id := NULL;
    NEW.last_delivery_status := NULL;
    IF NEW.status <> 'cancelled' THEN
      NEW.status := 'draft';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_customer_email_revision_guard ON admin_customer_email_messages;
CREATE TRIGGER admin_customer_email_revision_guard
BEFORE UPDATE ON admin_customer_email_messages
FOR EACH ROW
EXECUTE FUNCTION enforce_admin_customer_email_revision();

ALTER TABLE public.admin_customer_email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_admin_customer_email_platform_runtime_all ON public.admin_customer_email_messages;
CREATE POLICY bls_admin_customer_email_platform_runtime_all ON public.admin_customer_email_messages
  FOR ALL
  TO bls_platform_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_customer_email_messages
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_customer_email_messages
  TO bls_platform_runtime;

COMMENT ON TABLE public.admin_customer_email_messages
  IS 'Admin-only customer communication approval and delivery ledger. Public/Data API roles have no access.';

COMMIT;
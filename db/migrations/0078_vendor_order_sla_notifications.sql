-- Agreement-bound order SLA policies, notification-centre state, and escalation audit.
BEGIN;

CREATE TABLE vendor_order_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('sla_policy_' || replace(gen_random_uuid()::text,'-','')),
  agreement_id uuid NOT NULL UNIQUE REFERENCES vendor_commercial_agreements(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  acceptance_minutes integer NOT NULL CHECK (acceptance_minutes BETWEEN 5 AND 10080),
  preparation_minutes integer NOT NULL CHECK (preparation_minutes BETWEEN 5 AND 43200),
  warning_percent integer NOT NULL DEFAULT 50 CHECK (warning_percent BETWEEN 1 AND 95),
  email_reminder_percent integer NOT NULL DEFAULT 80 CHECK (email_reminder_percent BETWEEN 5 AND 99),
  escalation_grace_minutes integer NOT NULL DEFAULT 60 CHECK (escalation_grace_minutes BETWEEN 0 AND 10080),
  timezone text NOT NULL DEFAULT 'Europe/Athens',
  source_text_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (warning_percent < email_reminder_percent)
);

CREATE INDEX vendor_order_sla_vendor_idx
  ON vendor_order_sla_policies(vendor_id, enabled, updated_at DESC);

ALTER TABLE fulfilment_sla_cases
  ADD COLUMN IF NOT EXISTS agreement_id uuid REFERENCES vendor_commercial_agreements(id),
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES vendor_order_sla_policies(id),
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS baseline_status text,
  ADD COLUMN IF NOT EXISTS last_status_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS fulfilment_sla_agreement_idx
  ON fulfilment_sla_cases(agreement_id, state, due_at)
  WHERE agreement_id IS NOT NULL;

ALTER TABLE vendor_order_sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_order_sla_vendor_read
  ON vendor_order_sla_policies FOR SELECT
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);

CREATE POLICY vendor_order_sla_platform_all
  ON vendor_order_sla_policies FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

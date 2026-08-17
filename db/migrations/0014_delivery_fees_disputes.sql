-- Configurable customer delivery pricing, B2B fee snapshots and chargeback/dispute governance.
BEGIN;

CREATE TABLE delivery_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid REFERENCES vendor_businesses(id),
  mode fulfilment_mode NOT NULL,
  postcode_prefixes text[] NOT NULL DEFAULT '{}',
  currency char(3) NOT NULL DEFAULT 'EUR',
  base_charge_minor bigint NOT NULL CHECK (base_charge_minor >= 0),
  additional_package_charge_minor bigint NOT NULL DEFAULT 0 CHECK (additional_package_charge_minor >= 0),
  free_above_subtotal_minor bigint,
  minimum_subtotal_minor bigint,
  priority integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (free_above_subtotal_minor IS NULL OR free_above_subtotal_minor >= 0),
  CHECK (minimum_subtotal_minor IS NULL OR minimum_subtotal_minor >= 0),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX delivery_rules_lookup_idx ON delivery_rules(market_id, mode, vendor_id, active, priority DESC, version DESC);

ALTER TABLE fulfilment_orders
  ADD COLUMN IF NOT EXISTS merchandise_subtotal_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_charge_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waived_delivery_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_rule_id uuid REFERENCES delivery_rules(id),
  ADD COLUMN IF NOT EXISTS delivery_rule_version integer,
  ADD COLUMN IF NOT EXISTS delivery_quote_public_id text;

ALTER TABLE fee_rules
  ADD COLUMN IF NOT EXISTS fee_code text NOT NULL DEFAULT 'sales_service',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'market_default',
  ADD COLUMN IF NOT EXISTS calculation text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS fulfilment_mode fulfilment_mode,
  ADD COLUMN IF NOT EXISTS tax_rate_bps integer NOT NULL DEFAULT 2400;

ALTER TABLE fee_rules DROP CONSTRAINT IF EXISTS fee_rules_source_check;
ALTER TABLE fee_rules ADD CONSTRAINT fee_rules_source_check CHECK (source IN ('vendor_contract','campaign_credit','plan','category','market_default'));
ALTER TABLE fee_rules DROP CONSTRAINT IF EXISTS fee_rules_calculation_check;
ALTER TABLE fee_rules ADD CONSTRAINT fee_rules_calculation_check CHECK (calculation IN ('fixed','percentage','credit'));
ALTER TABLE fee_rules DROP CONSTRAINT IF EXISTS fee_rules_basis_check;
ALTER TABLE fee_rules ADD CONSTRAINT fee_rules_basis_check CHECK (basis IN ('supplier_net','supplier_gross','retail_net','retail_gross','shipping_reimbursement'));
CREATE INDEX IF NOT EXISTS fee_rules_resolution_idx ON fee_rules(market_id, fee_code, active, priority DESC, version DESC);

ALTER TABLE fee_snapshots
  ADD COLUMN IF NOT EXISTS fee_code text NOT NULL DEFAULT 'sales_service',
  ADD COLUMN IF NOT EXISTS rule_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS basis_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_rule_version jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE procurements
  ADD COLUMN IF NOT EXISTS service_fee_net_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_tax_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_before_dispute text,
  ADD COLUMN IF NOT EXISTS dispute_reference text;

CREATE TABLE payment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  market_id uuid NOT NULL REFERENCES markets(id),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  provider text NOT NULL,
  provider_case_id text NOT NULL,
  opening_provider_event_id text NOT NULL,
  reason_code text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'EUR',
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL CHECK (status IN ('evidence_required','submitted','won','lost','closed')),
  evidence_deadline timestamptz,
  outcome_reason text,
  liability_review_required boolean NOT NULL DEFAULT false,
  liability_allocation text CHECK (liability_allocation IN ('platform','vendor')),
  liability_reason text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_case_id),
  UNIQUE(provider, opening_provider_event_id)
);
CREATE INDEX payment_disputes_status_idx ON payment_disputes(market_id, status, opened_at DESC);
CREATE INDEX payment_disputes_order_idx ON payment_disputes(order_id, opened_at DESC);

CREATE TABLE payment_dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  dispute_id uuid NOT NULL REFERENCES payment_disputes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('order_confirmation','shipment_tracking','proof_of_delivery','pickup_proof','customer_message','product_description','refund_record','other')),
  reference text NOT NULL,
  description text,
  added_by uuid REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_dispute_evidence_case_idx ON payment_dispute_evidence(dispute_id, added_at);

CREATE TABLE payment_dispute_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES payment_disputes(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

ALTER TABLE delivery_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_dispute_provider_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_rules_platform_read ON delivery_rules
  FOR SELECT USING (current_setting('app.platform_access', true) = 'true');
CREATE POLICY delivery_rules_platform_write ON delivery_rules
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

CREATE POLICY fee_rules_platform_only ON fee_rules
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');
CREATE POLICY fee_snapshots_vendor_read ON fee_snapshots
  FOR SELECT USING (
    current_setting('app.platform_access', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM procurements p
      WHERE p.id = fee_snapshots.procurement_id
        AND p.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    )
  );
CREATE POLICY fee_snapshots_platform_write ON fee_snapshots
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

CREATE POLICY payment_disputes_platform_only ON payment_disputes
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');
CREATE POLICY payment_dispute_evidence_platform_only ON payment_dispute_evidence
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');
CREATE POLICY payment_dispute_provider_events_platform_only ON payment_dispute_provider_events
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

COMMIT;

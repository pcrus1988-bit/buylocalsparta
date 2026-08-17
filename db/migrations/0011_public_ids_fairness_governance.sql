-- Stable application-facing public identifiers and fairness appeal/anomaly governance.
-- Internal relational keys remain UUIDs; domain/public IDs may use readable opaque prefixes.
BEGIN;

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY[
    'users','addresses','vendor_businesses','vendor_locations','vendor_users','vendor_subscriptions',
    'product_families','canonical_variants','vendor_product_submissions','product_import_batches','product_import_rows','catalog_workflow_events','product_media','product_compliance_documents','product_merge_candidates',
    'vendor_offers','inventory_movements','fairness_assignment_events','sticky_assignments','fairness_overrides',
    'carts','cart_items','stock_reservations','customer_orders','order_lines','fulfilment_orders','pickup_groups','shipments',
    'payments','payment_events','refunds','tax_documents','procurements','vendor_invoices','fee_rules','fee_snapshots',
    'settlement_batches','settlement_lines','ledger_transactions','ledger_entries','adviser_profiles','adviser_availability',
    'conversations','messages','appointments','external_channel_consents','counteroffer_requests','private_offers',
    'returns','product_notices','reviews','notifications','outbox_events','audit_events','privacy_requests',
    'cms_pages','search_synonyms'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS public_id text', table_name);
    EXECUTE format('UPDATE %I SET public_id = id::text WHERE public_id IS NULL', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN public_id SET DEFAULT gen_random_uuid()::text', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN public_id SET NOT NULL', table_name);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I(public_id)', table_name || '_public_id_uidx', table_name);
  END LOOP;
END $$;

CREATE TABLE fairness_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  submitted_by uuid REFERENCES users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','rejected')),
  resolution text,
  resolved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((status IN ('resolved','rejected')) = (resolved_at IS NOT NULL))
);
CREATE INDEX fairness_appeals_vendor_status_idx ON fairness_appeals(vendor_id, status, created_at DESC);
CREATE INDEX fairness_appeals_variant_idx ON fairness_appeals(market_id, canonical_variant_id, created_at DESC);

CREATE TABLE fairness_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  market_id uuid NOT NULL REFERENCES markets(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  metric text NOT NULL DEFAULT 'qualified_exposure_share',
  target_share numeric(12,9) NOT NULL CHECK (target_share >= 0 AND target_share <= 1),
  actual_share numeric(12,9) NOT NULL CHECK (actual_share >= 0 AND actual_share <= 1),
  deviation numeric(12,9) NOT NULL,
  sample_size bigint NOT NULL CHECK (sample_size >= 0),
  threshold numeric(12,9) NOT NULL CHECK (threshold >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz
);
CREATE INDEX fairness_anomalies_open_idx ON fairness_anomalies(market_id, status, detected_at DESC) WHERE status <> 'resolved';
CREATE INDEX fairness_anomalies_vendor_idx ON fairness_anomalies(vendor_id, detected_at DESC);
CREATE UNIQUE INDEX fairness_anomalies_one_open_metric_uidx
  ON fairness_anomalies(market_id, canonical_variant_id, vendor_id, metric)
  WHERE status <> 'resolved';

ALTER TABLE fairness_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fairness_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY fairness_appeals_vendor_scope ON fairness_appeals
  USING (
    vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  )
  WITH CHECK (
    vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  );

CREATE POLICY fairness_anomalies_vendor_read ON fairness_anomalies
  FOR SELECT USING (
    vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY fairness_anomalies_platform_write ON fairness_anomalies
  FOR ALL USING (current_setting('app.platform_access', true) = 'true')
  WITH CHECK (current_setting('app.platform_access', true) = 'true');

COMMIT;

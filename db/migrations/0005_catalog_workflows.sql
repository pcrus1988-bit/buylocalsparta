-- Buy Local Sparta — persistent vendor product onboarding and Product Matching Centre
-- Adds source-product records without changing the canonical/public catalogue model.

CREATE TABLE vendor_product_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  vendor_sku text,
  category_id uuid NOT NULL REFERENCES categories(id),
  source_identity jsonb NOT NULL,
  supplier_unit_price_minor bigint NOT NULL CHECK (supplier_unit_price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  supplier_tax_rate_bps integer NOT NULL DEFAULT 2400 CHECK (supplier_tax_rate_bps BETWEEN 0 AND 10000),
  stock_on_hand integer NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  safety_stock integer NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
  fulfilment_modes fulfilment_mode[] NOT NULL DEFAULT ARRAY['pickup']::fulfilment_mode[],
  advice_available boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv','api')),
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','needs_review','linked','approved','rejected','archived')),
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  rejection_reason text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (safety_stock <= stock_on_hand)
);
CREATE INDEX vendor_product_submissions_vendor_idx ON vendor_product_submissions(vendor_id, status, updated_at DESC);
CREATE INDEX vendor_product_submissions_review_idx ON vendor_product_submissions(market_id, status, updated_at DESC) WHERE status IN ('submitted','needs_review','linked');
CREATE UNIQUE INDEX vendor_product_submissions_sku_unique ON vendor_product_submissions(vendor_id, location_id, vendor_sku) WHERE vendor_sku IS NOT NULL AND status <> 'archived';

ALTER TABLE product_merge_candidates
  ADD COLUMN submission_id uuid REFERENCES vendor_product_submissions(id);
CREATE INDEX product_merge_candidates_submission_idx ON product_merge_candidates(submission_id, status, created_at DESC);

CREATE TABLE product_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  source_filename text,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','committed','rejected','rolled_back')),
  total_rows integer NOT NULL CHECK (total_rows >= 0),
  valid_rows integer NOT NULL CHECK (valid_rows >= 0),
  error_rows integer NOT NULL CHECK (error_rows >= 0),
  submitted_after_import boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id, source_hash, status)
);

CREATE TABLE product_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES product_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 1),
  source_payload jsonb NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  submission_id uuid REFERENCES vendor_product_submissions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id, row_number)
);

CREATE TABLE catalog_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES vendor_product_submissions(id),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  from_status text,
  to_status text,
  canonical_variant_id uuid REFERENCES canonical_variants(id),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_workflow_events_submission_idx ON catalog_workflow_events(submission_id, created_at);

ALTER TABLE vendor_product_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_product_submission_scope ON vendor_product_submissions
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid)
  WITH CHECK (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);

CREATE POLICY product_import_batch_scope ON product_import_batches
  USING (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid)
  WITH CHECK (vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid);

CREATE POLICY product_import_row_scope ON product_import_rows
  USING (EXISTS (
    SELECT 1 FROM product_import_batches b
    WHERE b.id = product_import_rows.batch_id
      AND b.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
  ));

-- Workflow history is append-only; corrections are separate events.
CREATE OR REPLACE FUNCTION prevent_catalog_workflow_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'catalog workflow history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER catalog_workflow_events_no_update
  BEFORE UPDATE OR DELETE ON catalog_workflow_events
  FOR EACH ROW EXECUTE FUNCTION prevent_catalog_workflow_mutation();

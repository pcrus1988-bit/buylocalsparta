-- Dedicated pre-launch prospect intake for the 130 expansion HUBs.
-- This table is intentionally separate from Sparta vendor_applications and active marketplace state.
-- HUB assignment is derived from verified ΓΕΜΗ location evidence and cannot be selected by the applicant.
BEGIN;

CREATE TABLE IF NOT EXISTS hub_expansion_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  hub_id text NOT NULL CHECK (hub_id ~ '^KM-HUB-[0-9]{3}$'),
  hub_slug text NOT NULL CHECK (hub_slug ~ '^[a-z0-9-]{2,80}$'),
  hub_city text NOT NULL CHECK (length(btrim(hub_city)) BETWEEN 2 AND 120),
  hub_region text NOT NULL CHECK (length(btrim(hub_region)) BETWEEN 2 AND 120),
  plan_code text NOT NULL CHECK (plan_code IN ('claim','presence','shop','growth','pro')),
  tax_number text NOT NULL CHECK (tax_number ~ '^[0-9]{9}$'),
  gemi_number text NOT NULL CHECK (gemi_number ~ '^[0-9]+$'),
  business_name text NOT NULL CHECK (length(btrim(business_name)) BETWEEN 1 AND 120),
  legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 160),
  contact_name text NOT NULL CHECK (length(btrim(contact_name)) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 160),
  phone text NOT NULL CHECK (length(btrim(phone)) BETWEEN 8 AND 32),
  address_line text NOT NULL CHECK (length(btrim(address_line)) BETWEEN 3 AND 240),
  postal_code text NOT NULL CHECK (postal_code ~ '^[0-9]{5}$'),
  primary_category text NOT NULL CHECK (length(btrim(primary_category)) BETWEEN 2 AND 100),
  website_url text CHECK (website_url IS NULL OR length(btrim(website_url)) <= 240),
  current_sales_channels text CHECK (current_sales_channels IS NULL OR length(current_sales_channels) <= 600),
  notes text CHECK (notes IS NULL OR length(notes) <= 1500),
  source text NOT NULL DEFAULT 'hub_expansion_join' CHECK (source IN ('hub_expansion_join','admin','import')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','qualified','verified','approved','declined','converted')),
  setup_fee_cents integer NOT NULL DEFAULT 0 CHECK (setup_fee_cents >= 0),
  annual_fee_cents integer NOT NULL DEFAULT 0 CHECK (annual_fee_cents >= 0),
  commission_bps integer NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
  payment_state text NOT NULL DEFAULT 'not_requested' CHECK (payment_state IN ('not_required','not_requested','terms_sent','paid','waived')),
  consent_at timestamptz NOT NULL DEFAULT now(),
  registry_checked_at timestamptz NOT NULL,
  hub_resolution_method text NOT NULL CHECK (hub_resolution_method IN ('registry_locality','google_geocode')),
  hub_resolution_latitude double precision CHECK (hub_resolution_latitude IS NULL OR hub_resolution_latitude BETWEEN -90 AND 90),
  hub_resolution_longitude double precision CHECK (hub_resolution_longitude IS NULL OR hub_resolution_longitude BETWEEN -180 AND 180),
  hub_distance_km numeric(8,3) CHECK (hub_distance_km IS NULL OR hub_distance_km >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hub_id <> 'KM-HUB-015'),
  CHECK ((plan_code = 'claim' AND payment_state = 'not_required') OR plan_code <> 'claim')
);

CREATE INDEX IF NOT EXISTS hub_expansion_prospects_hub_status_idx
  ON hub_expansion_prospects(hub_slug, status, created_at DESC);
CREATE INDEX IF NOT EXISTS hub_expansion_prospects_email_idx
  ON hub_expansion_prospects(lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS hub_expansion_prospects_created_idx
  ON hub_expansion_prospects(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS hub_expansion_prospects_open_tax_number_uidx
  ON hub_expansion_prospects(tax_number)
  WHERE status NOT IN ('declined','converted');

ALTER TABLE hub_expansion_prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hub_expansion_prospects_platform_scope ON hub_expansion_prospects;
CREATE POLICY hub_expansion_prospects_platform_scope ON hub_expansion_prospects
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT, INSERT, UPDATE, DELETE ON hub_expansion_prospects TO bls_platform_runtime;

COMMENT ON TABLE hub_expansion_prospects IS
  'Pre-launch merchant interest for non-Sparta expansion HUBs. HUB identity is derived from verified GEMI location evidence; prospect records never imply active marketplace/vendor access.';
COMMENT ON COLUMN hub_expansion_prospects.tax_number IS
  'Greek AFM revalidated server-side at submission and used to prevent duplicate open prospect records.';
COMMENT ON COLUMN hub_expansion_prospects.hub_resolution_method IS
  'How the application mapped verified registry location to the governed 131-HUB master.';
COMMENT ON COLUMN hub_expansion_prospects.payment_state IS
  'CLAIM is always not_required at intake. Paid plans remain not_requested until verification/commercial approval.';

COMMIT;

-- Buy Local Sparta — durable private media upload intents and malware-scan worker leases.
BEGIN;

CREATE TABLE media_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id),
  kind text NOT NULL CHECK (kind IN ('image','video','document')),
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  expected_byte_size bigint NOT NULL CHECK (expected_byte_size > 0),
  alt_text text,
  rights_owner text NOT NULL CHECK (length(btrim(rights_owner)) > 0),
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','completed','expired','failed')),
  expires_at timestamptz NOT NULL,
  storage_verified_at timestamptz,
  media_asset_id uuid REFERENCES product_media(id),
  failure_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX media_upload_intents_vendor_idx ON media_upload_intents(vendor_id, created_at DESC);
CREATE INDEX media_upload_intents_expiry_idx ON media_upload_intents(expires_at) WHERE status='initiated';

ALTER TABLE product_media
  ADD COLUMN IF NOT EXISTS storage_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_attempts integer NOT NULL DEFAULT 0 CHECK (scan_attempts >= 0),
  ADD COLUMN IF NOT EXISTS scan_lease_owner text,
  ADD COLUMN IF NOT EXISTS scan_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_scan_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_error text;

CREATE INDEX IF NOT EXISTS product_media_scan_queue_idx
  ON product_media(next_scan_at, created_at)
  WHERE scan_status IN ('pending','failed');

ALTER TABLE media_upload_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_upload_intents_vendor_select ON media_upload_intents
  FOR SELECT USING (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY media_upload_intents_vendor_write ON media_upload_intents
  FOR ALL USING (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  ) WITH CHECK (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  );

COMMIT;

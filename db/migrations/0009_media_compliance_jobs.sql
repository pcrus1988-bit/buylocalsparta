-- Product media/compliance hardening and dead-letter background job support.
BEGIN;

ALTER TABLE product_media
  ADD COLUMN original_filename text,
  ADD COLUMN content_type text,
  ADD COLUMN byte_size bigint CHECK (byte_size IS NULL OR byte_size > 0),
  ADD COLUMN sha256 char(64),
  ADD COLUMN scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','infected','failed')),
  ADD COLUMN rejection_reason text,
  ADD COLUMN reviewed_by uuid REFERENCES users(id),
  ADD COLUMN reviewed_at timestamptz;

CREATE UNIQUE INDEX product_media_object_key_uidx ON product_media(object_key);
CREATE INDEX product_media_public_idx ON product_media(canonical_variant_id, sort_order)
  WHERE scan_status = 'clean' AND rights_status = 'approved' AND moderation_status = 'approved';
CREATE INDEX product_media_vendor_idx ON product_media(vendor_id, created_at DESC) WHERE vendor_id IS NOT NULL;

ALTER TABLE product_compliance_documents
  ADD COLUMN vendor_id uuid REFERENCES vendor_businesses(id),
  ADD COLUMN media_asset_id uuid REFERENCES product_media(id),
  ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','expired')),
  ADD COLUMN verified_by uuid REFERENCES users(id),
  ADD COLUMN rejection_reason text;
CREATE INDEX product_compliance_variant_status_idx ON product_compliance_documents(canonical_variant_id, status, valid_to);
CREATE INDEX product_compliance_vendor_idx ON product_compliance_documents(vendor_id, status) WHERE vendor_id IS NOT NULL;

ALTER TABLE product_notices
  ADD COLUMN resolved_by uuid REFERENCES users(id),
  ADD COLUMN resolution text;

ALTER TABLE outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_status_check CHECK (status IN ('pending','processing','processed','failed','dead_lettered')),
  ADD COLUMN dead_lettered_at timestamptz;
CREATE INDEX outbox_dead_letter_idx ON outbox_events(dead_lettered_at DESC) WHERE status = 'dead_lettered';

ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_compliance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_media_vendor_select ON product_media
  FOR SELECT USING (
    vendor_id IS NULL
    OR vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY product_media_vendor_write ON product_media
  FOR ALL USING (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  ) WITH CHECK (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  );

CREATE POLICY product_compliance_vendor_select ON product_compliance_documents
  FOR SELECT USING (
    vendor_id IS NULL
    OR vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  );
CREATE POLICY product_compliance_vendor_write ON product_compliance_documents
  FOR ALL USING (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  ) WITH CHECK (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR current_setting('app.platform_access', true) = 'true'
  );

COMMIT;

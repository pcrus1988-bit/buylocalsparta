-- BOX NOW first production courier bridge: provider origin mapping, durable creation/reconciliation state and shipment metadata.
BEGIN;

CREATE TABLE shipping_provider_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_location_id uuid NOT NULL REFERENCES vendor_locations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_location_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  configured_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_location_id, provider)
);
CREATE UNIQUE INDEX shipping_provider_locations_provider_uidx ON shipping_provider_locations(provider, provider_location_id) WHERE active;

ALTER TABLE shipments
  ADD COLUMN provider_reference_number text,
  ADD COLUMN provider_parcel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN provider_creation_state text NOT NULL DEFAULT 'not_started',
  ADD COLUMN provider_request_hash text,
  ADD COLUMN provider_last_error text,
  ADD COLUMN provider_attempted_at timestamptz,
  ADD COLUMN provider_confirmed_at timestamptz,
  ADD COLUMN provider_state jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE shipments ADD CONSTRAINT shipments_provider_creation_state_check
  CHECK (provider_creation_state IN ('not_started','creating','confirmed','manual_review','failed','cancelled'));

CREATE UNIQUE INDEX shipments_provider_reference_uidx ON shipments(carrier, provider_reference_number) WHERE provider_reference_number IS NOT NULL;

CREATE TABLE shipment_provider_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  provider text NOT NULL,
  attempt_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('creating','confirmed','manual_review','failed','cancelled')),
  provider_reference_number text,
  provider_parcel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, attempt_key)
);
CREATE INDEX shipment_provider_attempts_shipment_idx ON shipment_provider_attempts(shipment_id, created_at DESC);

ALTER TABLE shipping_provider_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_provider_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY shipping_provider_locations_vendor_read ON shipping_provider_locations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vendor_locations vl WHERE vl.id=vendor_location_id AND vl.vendor_id::text=current_setting('app.vendor_id', true))
    OR (SELECT bls_private.is_platform_runtime())
  );
CREATE POLICY shipping_provider_locations_platform_write ON shipping_provider_locations
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY shipment_provider_attempts_vendor_read ON shipment_provider_attempts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM shipments s WHERE s.id=shipment_id AND s.vendor_id::text=current_setting('app.vendor_id', true))
    OR (SELECT bls_private.is_platform_runtime())
  );
CREATE POLICY shipment_provider_attempts_platform_write ON shipment_provider_attempts
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

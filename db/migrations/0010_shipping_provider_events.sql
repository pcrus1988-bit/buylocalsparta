-- Direct-shipping operational state, provider webhook idempotency and shipment vendor isolation.
BEGIN;

ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments
  ADD CONSTRAINT shipments_status_check CHECK (status IN ('created','label_ready','handed_to_carrier','in_transit','delivered','exception','lost','returned','cancelled')),
  ADD COLUMN vendor_id uuid REFERENCES vendor_businesses(id),
  ADD COLUMN location_id uuid REFERENCES vendor_locations(id),
  ADD COLUMN from_postcode text,
  ADD COLUMN to_postcode text,
  ADD COLUMN package_count integer NOT NULL DEFAULT 1 CHECK (package_count > 0),
  ADD COLUMN quoted_amount_minor bigint CHECK (quoted_amount_minor IS NULL OR quoted_amount_minor >= 0),
  ADD COLUMN currency char(3) NOT NULL DEFAULT 'EUR',
  ADD COLUMN handed_over_at timestamptz,
  ADD COLUMN exception_reason text;

UPDATE shipments s
SET vendor_id = f.vendor_id,
    location_id = f.location_id
FROM fulfilment_orders f
WHERE s.fulfilment_order_id = f.id AND s.vendor_id IS NULL;

ALTER TABLE shipments ALTER COLUMN vendor_id SET NOT NULL;
ALTER TABLE shipments ALTER COLUMN location_id SET NOT NULL;
CREATE UNIQUE INDEX shipments_active_fulfilment_uidx ON shipments(fulfilment_order_id) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX shipments_provider_id_uidx ON shipments(carrier, provider_shipment_id) WHERE provider_shipment_id IS NOT NULL;
CREATE INDEX shipments_vendor_status_idx ON shipments(vendor_id, status, updated_at DESC);
CREATE INDEX shipments_tracking_idx ON shipments(tracking_number) WHERE tracking_number IS NOT NULL;

CREATE TABLE shipment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX shipment_provider_events_shipment_idx ON shipment_provider_events(shipment_id, received_at DESC);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_provider_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY shipments_vendor_scope ON shipments
  USING (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR (SELECT bls_private.is_platform_runtime())
  )
  WITH CHECK (
    vendor_id::text = current_setting('app.vendor_id', true)
    OR (SELECT bls_private.is_platform_runtime())
  );

CREATE POLICY shipment_provider_events_platform_only ON shipment_provider_events
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

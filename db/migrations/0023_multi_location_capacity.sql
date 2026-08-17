BEGIN;

ALTER TABLE vendor_locations
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Athens';

-- Existing installations predate explicit primary-location semantics. Backfill one active
-- primary only for vendors that do not already have one, preserving any deliberate choice.
WITH candidates AS (
  SELECT DISTINCT ON (vl.vendor_id) vl.id, vl.vendor_id
  FROM vendor_locations vl
  WHERE vl.active
    AND NOT EXISTS (
      SELECT 1 FROM vendor_locations existing
      WHERE existing.vendor_id=vl.vendor_id AND existing.active AND existing.is_primary
    )
  ORDER BY vl.vendor_id, vl.created_at, vl.id
)
UPDATE vendor_locations target
SET is_primary=true
FROM candidates candidate
WHERE target.id=candidate.id;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_locations_one_primary_idx
  ON vendor_locations(vendor_id) WHERE is_primary AND active;

ALTER TABLE vendor_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_locations_vendor_read ON vendor_locations;
CREATE POLICY vendor_locations_vendor_read ON vendor_locations FOR SELECT
  USING (vendor_id=current_setting('app.vendor_id',true)::uuid OR current_setting('app.platform_access',true)='true');
DROP POLICY IF EXISTS vendor_locations_vendor_insert ON vendor_locations;
CREATE POLICY vendor_locations_vendor_insert ON vendor_locations FOR INSERT
  WITH CHECK (vendor_id=current_setting('app.vendor_id',true)::uuid OR current_setting('app.platform_access',true)='true');
DROP POLICY IF EXISTS vendor_locations_vendor_update ON vendor_locations;
CREATE POLICY vendor_locations_vendor_update ON vendor_locations FOR UPDATE
  USING (vendor_id=current_setting('app.vendor_id',true)::uuid OR current_setting('app.platform_access',true)='true')
  WITH CHECK (vendor_id=current_setting('app.vendor_id',true)::uuid OR current_setting('app.platform_access',true)='true');

CREATE TABLE IF NOT EXISTS fulfilment_capacity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  mode fulfilment_mode NOT NULL,
  max_open_fulfilments integer NOT NULL CHECK (max_open_fulfilments > 0),
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS fulfilment_capacity_rules_lookup_idx
  ON fulfilment_capacity_rules(vendor_id,location_id,mode,active,priority DESC,starts_at);

ALTER TABLE fulfilment_capacity_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fulfilment_capacity_rules_vendor_read ON fulfilment_capacity_rules;
CREATE POLICY fulfilment_capacity_rules_vendor_read ON fulfilment_capacity_rules FOR SELECT
  USING (vendor_id=current_setting('app.vendor_id',true)::uuid OR current_setting('app.platform_access',true)='true');
DROP POLICY IF EXISTS fulfilment_capacity_rules_vendor_write ON fulfilment_capacity_rules;
CREATE POLICY fulfilment_capacity_rules_vendor_write ON fulfilment_capacity_rules FOR ALL
  USING (vendor_id=current_setting('app.vendor_id',true)::uuid OR current_setting('app.platform_access',true)='true')
  WITH CHECK (vendor_id=current_setting('app.vendor_id',true)::uuid OR current_setting('app.platform_access',true)='true');

COMMIT;

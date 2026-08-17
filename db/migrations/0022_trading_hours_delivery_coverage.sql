-- Merchant trading calendars, business-hour aware operations and geographic/postcode fulfilment coverage.
-- Delivery coverage is deliberately separate from customer delivery pricing.
BEGIN;

CREATE TABLE vendor_location_calendars (
  location_id uuid PRIMARY KEY REFERENCES vendor_locations(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Europe/Athens',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vendor_location_opening_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  location_id uuid NOT NULL REFERENCES vendor_location_calendars(location_id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_minute smallint NOT NULL CHECK (opens_minute BETWEEN 0 AND 1439),
  closes_minute smallint NOT NULL CHECK (closes_minute BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_minute < closes_minute)
);
CREATE INDEX vendor_opening_intervals_location_day_idx ON vendor_location_opening_intervals(location_id, weekday, opens_minute);

CREATE TABLE vendor_location_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  location_id uuid NOT NULL REFERENCES vendor_location_calendars(location_id) ON DELETE CASCADE,
  local_date date NOT NULL,
  closed boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(location_id, local_date)
);

CREATE TABLE vendor_location_exception_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  exception_id uuid NOT NULL REFERENCES vendor_location_schedule_exceptions(id) ON DELETE CASCADE,
  opens_minute smallint NOT NULL CHECK (opens_minute BETWEEN 0 AND 1439),
  closes_minute smallint NOT NULL CHECK (closes_minute BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_minute < closes_minute)
);
CREATE INDEX vendor_exception_intervals_exception_idx ON vendor_location_exception_intervals(exception_id, opens_minute);

CREATE TABLE fulfilment_service_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  market_id uuid NOT NULL REFERENCES markets(id),
  vendor_id uuid NOT NULL REFERENCES vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES vendor_locations(id),
  mode fulfilment_mode NOT NULL,
  postcode_prefixes text[] NOT NULL DEFAULT '{}',
  center geography(point,4326),
  radius_meters integer CHECK (radius_meters IS NULL OR radius_meters > 0),
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (mode <> 'local_delivery' OR cardinality(postcode_prefixes) > 0 OR radius_meters IS NOT NULL),
  CHECK (radius_meters IS NULL OR center IS NOT NULL)
);
CREATE INDEX fulfilment_service_zones_scope_idx ON fulfilment_service_zones(market_id, vendor_id, location_id, mode, active);
CREATE INDEX fulfilment_service_zones_geo_idx ON fulfilment_service_zones USING gist(center) WHERE center IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_opening_interval_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vendor_location_opening_intervals x
    WHERE x.location_id=NEW.location_id AND x.weekday=NEW.weekday AND x.id<>NEW.id
      AND int4range(x.opens_minute, x.closes_minute, '[)') && int4range(NEW.opens_minute, NEW.closes_minute, '[)')
  ) THEN RAISE EXCEPTION 'opening intervals cannot overlap'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vendor_opening_interval_overlap_guard BEFORE INSERT OR UPDATE ON vendor_location_opening_intervals FOR EACH ROW EXECUTE FUNCTION validate_opening_interval_overlap();

CREATE OR REPLACE FUNCTION validate_exception_interval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE is_closed boolean;
BEGIN
  SELECT closed INTO is_closed FROM vendor_location_schedule_exceptions WHERE id=NEW.exception_id;
  IF is_closed THEN RAISE EXCEPTION 'closed schedule exception cannot contain opening intervals'; END IF;
  IF EXISTS (
    SELECT 1 FROM vendor_location_exception_intervals x
    WHERE x.exception_id=NEW.exception_id AND x.id<>NEW.id
      AND int4range(x.opens_minute, x.closes_minute, '[)') && int4range(NEW.opens_minute, NEW.closes_minute, '[)')
  ) THEN RAISE EXCEPTION 'exception opening intervals cannot overlap'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vendor_exception_interval_guard BEFORE INSERT OR UPDATE ON vendor_location_exception_intervals FOR EACH ROW EXECUTE FUNCTION validate_exception_interval();

CREATE OR REPLACE FUNCTION guard_service_zone_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE location_vendor uuid; location_market uuid;
BEGIN
  SELECT vendor_id, market_id INTO location_vendor, location_market FROM vendor_locations WHERE id=NEW.location_id;
  IF location_vendor IS NULL OR location_vendor<>NEW.vendor_id OR location_market<>NEW.market_id THEN
    RAISE EXCEPTION 'service zone location must belong to the same vendor and market';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fulfilment_service_zone_ownership_guard BEFORE INSERT OR UPDATE ON fulfilment_service_zones FOR EACH ROW EXECUTE FUNCTION guard_service_zone_ownership();

ALTER TABLE vendor_location_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_location_opening_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_location_schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_location_exception_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfilment_service_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_calendars_vendor_all ON vendor_location_calendars FOR ALL
  USING (EXISTS (SELECT 1 FROM vendor_locations l WHERE l.id=location_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM vendor_locations l WHERE l.id=location_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid));
CREATE POLICY vendor_calendars_platform_all ON vendor_location_calendars FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_opening_vendor_all ON vendor_location_opening_intervals FOR ALL
  USING (EXISTS (SELECT 1 FROM vendor_locations l WHERE l.id=location_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM vendor_locations l WHERE l.id=location_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid));
CREATE POLICY vendor_opening_platform_all ON vendor_location_opening_intervals FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_schedule_exception_vendor_all ON vendor_location_schedule_exceptions FOR ALL
  USING (EXISTS (SELECT 1 FROM vendor_locations l WHERE l.id=location_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM vendor_locations l WHERE l.id=location_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid));
CREATE POLICY vendor_schedule_exception_platform_all ON vendor_location_schedule_exceptions FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_exception_interval_vendor_all ON vendor_location_exception_intervals FOR ALL
  USING (EXISTS (SELECT 1 FROM vendor_location_schedule_exceptions e JOIN vendor_locations l ON l.id=e.location_id WHERE e.id=exception_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM vendor_location_schedule_exceptions e JOIN vendor_locations l ON l.id=e.location_id WHERE e.id=exception_id AND l.vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid));
CREATE POLICY vendor_exception_interval_platform_all ON vendor_location_exception_intervals FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY fulfilment_service_zones_vendor_all ON fulfilment_service_zones FOR ALL
  USING (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id', true),'')::uuid);
CREATE POLICY fulfilment_service_zones_platform_all ON fulfilment_service_zones FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

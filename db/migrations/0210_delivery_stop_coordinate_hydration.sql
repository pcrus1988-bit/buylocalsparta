BEGIN;

-- Delivery routing must prefer coordinates already verified/stored on the source
-- vendor location or customer saved address instead of forcing every job stop
-- through an external geocoder. This also repairs existing open stops whose
-- source record already carries a PostGIS point.
CREATE OR REPLACE FUNCTION bls_private.hydrate_delivery_stop_coordinates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions', 'bls_private'
AS $$
DECLARE
  v_coordinates geography(Point,4326);
BEGIN
  -- Preserve explicit stop coordinates. They may come from a later/manual
  -- correction and therefore take precedence over source-record hydration.
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.location_id IS NOT NULL THEN
    SELECT vl.coordinates
      INTO v_coordinates
      FROM public.vendor_locations vl
     WHERE vl.id = NEW.location_id
       AND vl.coordinates IS NOT NULL
     LIMIT 1;
  END IF;

  IF v_coordinates IS NULL
     AND NULLIF(btrim(COALESCE(NEW.address_snapshot->>'addressId','')), '') IS NOT NULL THEN
    SELECT a.coordinates
      INTO v_coordinates
      FROM public.addresses a
     WHERE a.public_id = NEW.address_snapshot->>'addressId'
       AND a.coordinates IS NOT NULL
     LIMIT 1;
  END IF;

  IF v_coordinates IS NOT NULL THEN
    NEW.latitude := ST_Y(v_coordinates::geometry);
    NEW.longitude := ST_X(v_coordinates::geometry);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.hydrate_delivery_stop_coordinates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.hydrate_delivery_stop_coordinates() TO bls_platform_runtime;

DROP TRIGGER IF EXISTS delivery_stops_hydrate_coordinates ON public.delivery_stops;
CREATE TRIGGER delivery_stops_hydrate_coordinates
BEFORE INSERT OR UPDATE OF location_id,address_snapshot,latitude,longitude
ON public.delivery_stops
FOR EACH ROW
EXECUTE FUNCTION bls_private.hydrate_delivery_stop_coordinates();

-- Repair existing stops from vendor location coordinates.
UPDATE public.delivery_stops s
SET latitude = ST_Y(vl.coordinates::geometry),
    longitude = ST_X(vl.coordinates::geometry),
    updated_at = now()
FROM public.vendor_locations vl
WHERE s.location_id = vl.id
  AND vl.coordinates IS NOT NULL
  AND (s.latitude IS NULL OR s.longitude IS NULL);

-- Repair customer stops when their immutable address snapshot references a saved
-- customer address that already has coordinates.
UPDATE public.delivery_stops s
SET latitude = ST_Y(a.coordinates::geometry),
    longitude = ST_X(a.coordinates::geometry),
    updated_at = now()
FROM public.addresses a
WHERE a.public_id = s.address_snapshot->>'addressId'
  AND a.coordinates IS NOT NULL
  AND (s.latitude IS NULL OR s.longitude IS NULL);

COMMIT;

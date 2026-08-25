-- KONTA MOU — market-wide local delivery defaults and automatic vendor-location coverage.
-- Product-level eligibility remains vendor-controlled; this migration supplies the operational
-- market coverage required for local-delivery checkout and keeps Admin Delivery authoritative.

BEGIN;

CREATE TABLE public.market_local_delivery_defaults (
  market_id uuid PRIMARY KEY REFERENCES public.markets(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  postcode_prefixes text[] NOT NULL DEFAULT '{}',
  base_charge_minor bigint NOT NULL DEFAULT 0 CHECK (base_charge_minor >= 0),
  free_above_subtotal_minor bigint CHECK (free_above_subtotal_minor IS NULL OR free_above_subtotal_minor >= 0),
  minimum_subtotal_minor bigint CHECK (minimum_subtotal_minor IS NULL OR minimum_subtotal_minor >= 0),
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT active OR cardinality(postcode_prefixes) > 0)
);

ALTER TABLE public.market_local_delivery_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_local_delivery_defaults_runtime_all
  ON public.market_local_delivery_defaults
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.market_local_delivery_defaults
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.market_local_delivery_defaults
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.sync_market_local_delivery_defaults(p_market_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_defaults public.market_local_delivery_defaults%ROWTYPE;
  v_market_code text;
  v_rule_public_id text;
BEGIN
  SELECT *
    INTO v_defaults
    FROM public.market_local_delivery_defaults
   WHERE market_id = p_market_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT code
    INTO v_market_code
    FROM public.markets
   WHERE id = p_market_id;

  IF v_market_code IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.fulfilment_service_zones(
    public_id, market_id, vendor_id, location_id, mode, postcode_prefixes,
    active, priority, starts_at, ends_at, created_at, updated_at
  )
  SELECT
    'market_default_local_delivery_' || l.public_id,
    l.market_id,
    l.vendor_id,
    l.id,
    'local_delivery'::public.fulfilment_mode,
    v_defaults.postcode_prefixes,
    (v_defaults.active AND l.active),
    -100,
    now() - interval '1 minute',
    NULL,
    now(),
    now()
  FROM public.vendor_locations l
  WHERE l.market_id = p_market_id
  ON CONFLICT (public_id) DO UPDATE
    SET postcode_prefixes = EXCLUDED.postcode_prefixes,
        active = EXCLUDED.active,
        priority = EXCLUDED.priority,
        ends_at = NULL,
        updated_at = now();

  UPDATE public.fulfilment_service_zones z
     SET active = false,
         updated_at = now()
   WHERE z.market_id = p_market_id
     AND z.mode = 'local_delivery'::public.fulfilment_mode
     AND z.public_id LIKE 'market_default_local_delivery_%'
     AND NOT EXISTS (
       SELECT 1
       FROM public.vendor_locations l
       WHERE l.id = z.location_id
         AND l.market_id = p_market_id
         AND l.active
     );

  v_rule_public_id := 'market_default_local_delivery_rule_' || regexp_replace(lower(v_market_code), '[^a-z0-9]+', '_', 'g');

  INSERT INTO public.delivery_rules(
    public_id, market_id, vendor_id, mode, postcode_prefixes, currency,
    base_charge_minor, additional_package_charge_minor,
    free_above_subtotal_minor, minimum_subtotal_minor,
    priority, version, active, starts_at, ends_at, created_at
  )
  VALUES(
    v_rule_public_id,
    p_market_id,
    NULL,
    'local_delivery'::public.fulfilment_mode,
    v_defaults.postcode_prefixes,
    'EUR',
    v_defaults.base_charge_minor,
    0,
    v_defaults.free_above_subtotal_minor,
    v_defaults.minimum_subtotal_minor,
    -100,
    1,
    v_defaults.active,
    now() - interval '1 minute',
    NULL,
    now()
  )
  ON CONFLICT (public_id) DO UPDATE
    SET postcode_prefixes = EXCLUDED.postcode_prefixes,
        base_charge_minor = EXCLUDED.base_charge_minor,
        free_above_subtotal_minor = EXCLUDED.free_above_subtotal_minor,
        minimum_subtotal_minor = EXCLUDED.minimum_subtotal_minor,
        active = EXCLUDED.active,
        ends_at = NULL,
        priority = EXCLUDED.priority,
        version = CASE
          WHEN public.delivery_rules.postcode_prefixes IS DISTINCT FROM EXCLUDED.postcode_prefixes
            OR public.delivery_rules.base_charge_minor IS DISTINCT FROM EXCLUDED.base_charge_minor
            OR public.delivery_rules.free_above_subtotal_minor IS DISTINCT FROM EXCLUDED.free_above_subtotal_minor
            OR public.delivery_rules.minimum_subtotal_minor IS DISTINCT FROM EXCLUDED.minimum_subtotal_minor
            OR public.delivery_rules.active IS DISTINCT FROM EXCLUDED.active
          THEN public.delivery_rules.version + 1
          ELSE public.delivery_rules.version
        END;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.sync_market_local_delivery_defaults(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.sync_market_local_delivery_defaults(uuid)
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.sync_market_local_delivery_defaults_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  PERFORM bls_private.sync_market_local_delivery_defaults(NEW.market_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.sync_market_local_delivery_defaults_trigger() FROM PUBLIC;

CREATE TRIGGER market_local_delivery_defaults_sync
AFTER INSERT OR UPDATE
ON public.market_local_delivery_defaults
FOR EACH ROW
EXECUTE FUNCTION bls_private.sync_market_local_delivery_defaults_trigger();

CREATE OR REPLACE FUNCTION bls_private.sync_vendor_location_market_delivery_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
BEGIN
  PERFORM bls_private.sync_market_local_delivery_defaults(NEW.market_id);
  IF TG_OP = 'UPDATE' AND OLD.market_id IS DISTINCT FROM NEW.market_id THEN
    PERFORM bls_private.sync_market_local_delivery_defaults(OLD.market_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.sync_vendor_location_market_delivery_defaults() FROM PUBLIC;

CREATE TRIGGER vendor_location_market_delivery_defaults_sync
AFTER INSERT OR UPDATE OF active, market_id, vendor_id
ON public.vendor_locations
FOR EACH ROW
EXECUTE FUNCTION bls_private.sync_vendor_location_market_delivery_defaults();

INSERT INTO public.market_local_delivery_defaults(
  market_id, active, postcode_prefixes, base_charge_minor,
  free_above_subtotal_minor, minimum_subtotal_minor
)
SELECT
  m.id,
  true,
  ARRAY['23100']::text[],
  0,
  NULL,
  NULL
FROM public.markets m
WHERE m.code = 'sparta'
ON CONFLICT (market_id) DO NOTHING;

COMMENT ON TABLE public.market_local_delivery_defaults IS
  'Admin-controlled market fallback for local delivery coverage and pricing. Vendor product offers may still opt out as pickup-only.';

COMMENT ON FUNCTION bls_private.sync_market_local_delivery_defaults(uuid) IS
  'Synchronizes platform-default local-delivery service zones for every vendor location in a market plus the fallback delivery pricing rule.';

COMMIT;

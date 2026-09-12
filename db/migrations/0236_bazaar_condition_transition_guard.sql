-- 0236_bazaar_condition_transition_guard.sql
-- Preserve supplier/order history while allowing a NOVA SKU to move safely
-- between the normal and BAZAAR commerce channels when supplier condition changes.
--
-- The materializer treats (supplier_id, external_variant_id) as the live supplier
-- identity. If a newer immutable catalogue snapshot classifies that identity into a
-- different commerce channel, the historical supplier offer is retained under a
-- retired key, deactivated, and its old vendor offer is hidden/paused. The next
-- materialization pass is then free to create/reuse a canonical strictly inside the
-- new channel. No historical supplier-offer row is deleted because fulfilment lines
-- may reference it.

CREATE OR REPLACE FUNCTION bls_private.catalog_nova_condition_label(payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    btrim(
      CASE
        WHEN jsonb_typeof(payload->'condition') = 'string'
          THEN payload->>'condition'
        WHEN jsonb_typeof(payload->'condition') = 'object'
          THEN COALESCE(
            payload->'condition'->>'name',
            payload->'condition'->>'label',
            payload->'condition'->>'value',
            payload->'condition'->>'title'
          )
        ELSE NULL
      END
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_nova_commerce_channel(payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH condition_value AS (
    SELECT lower(replace(replace(bls_private.catalog_nova_condition_label(payload), '–', '-'), '—', '-')) AS label
  )
  SELECT CASE
    WHEN label LIKE '%preloved%'
      OR label LIKE '%pre-loved%'
      OR label LIKE '%preowned%'
      OR label LIKE '%pre-owned%'
      OR label LIKE '%defect%'
      OR label LIKE '%damaged%'
      THEN 'bazaar'
    ELSE 'normal'
  END
  FROM condition_value;
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_nova_retire_channel_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  supplier_uuid uuid;
  target_channel text;
  variant jsonb;
  external_variant text;
  previous record;
  retired_external_variant text;
BEGIN
  SELECT ds.id
  INTO supplier_uuid
  FROM public.dropship_suppliers ds
  WHERE ds.catalog_source_id = NEW.source_id
    AND ds.code = 'nova_brandsgateway'
  ORDER BY ds.created_at, ds.id
  LIMIT 1;

  IF supplier_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  target_channel := bls_private.catalog_nova_commerce_channel(NEW.normalized_payload);

  IF jsonb_typeof(NEW.normalized_payload->'variants') <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR variant IN
    SELECT value
    FROM jsonb_array_elements(NEW.normalized_payload->'variants')
  LOOP
    external_variant := NULLIF(btrim(variant->>'externalVariantId'), '');
    IF external_variant IS NULL THEN
      CONTINUE;
    END IF;

    FOR previous IN
      SELECT
        dso.id AS supplier_offer_id,
        dso.vendor_offer_id,
        dso.external_variant_id,
        COALESCE(cv.commerce_channel, 'normal') AS current_channel
      FROM public.dropship_supplier_offers dso
      JOIN public.vendor_offers vo ON vo.id = dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id = vo.canonical_variant_id
      WHERE dso.supplier_id = supplier_uuid
        AND dso.external_variant_id = external_variant
        AND COALESCE(cv.commerce_channel, 'normal') <> target_channel
      FOR UPDATE OF dso
    LOOP
      -- Fail closed immediately so an item whose supplier condition changed can
      -- never remain discoverable in the wrong commerce channel while waiting for
      -- the next bounded materialization pass.
      UPDATE public.vendor_offers
      SET merchant_visible = false,
          merchant_pause_active = true,
          updated_at = now()
      WHERE id = previous.vendor_offer_id;

      retired_external_variant := previous.external_variant_id
        || '#retired-channel-'
        || left(replace(previous.supplier_offer_id::text, '-', ''), 16);

      UPDATE public.dropship_supplier_offers
      SET external_variant_id = retired_external_variant,
          active = false,
          cached_available = false,
          cached_quantity = 0,
          availability_expires_at = now(),
          availability_payload = COALESCE(availability_payload, '{}'::jsonb)
            || jsonb_build_object(
              'channelTransitionRetired', true,
              'previousExternalVariantId', previous.external_variant_id,
              'previousCommerceChannel', previous.current_channel,
              'targetCommerceChannel', target_channel,
              'retiredAt', now()
            ),
          updated_at = now()
      WHERE id = previous.supplier_offer_id;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_nova_channel_transition_guard
  ON public.catalog_source_products;

-- Supplier catalogue evidence is append-only. The guard therefore observes only
-- newly appended evidence; it never attempts to mutate historical source rows.
CREATE TRIGGER catalog_nova_channel_transition_guard
AFTER INSERT
ON public.catalog_source_products
FOR EACH ROW
EXECUTE FUNCTION bls_private.catalog_nova_retire_channel_transition();

-- A deployment can briefly have the new database migration active while an older
-- materializer process is still draining work. Prevent that older process from
-- recreating a live supplier identity against a canonical in the wrong channel.
-- The rejected vendor offer remains an unpublished draft; the channel-aware
-- materializer can subsequently create the correct supplier offer safely.
CREATE OR REPLACE FUNCTION bls_private.catalog_nova_supplier_offer_channel_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  supplier_code text;
  target_channel text;
  offer_channel text;
BEGIN
  SELECT ds.code
  INTO supplier_code
  FROM public.dropship_suppliers ds
  WHERE ds.id = NEW.supplier_id;

  IF supplier_code IS DISTINCT FROM 'nova_brandsgateway' THEN
    RETURN NEW;
  END IF;

  SELECT bls_private.catalog_nova_commerce_channel(csp.normalized_payload)
  INTO target_channel
  FROM public.catalog_source_products csp
  WHERE csp.id = NEW.source_product_id;

  IF target_channel IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(cv.commerce_channel, 'normal')
  INTO offer_channel
  FROM public.vendor_offers vo
  JOIN public.canonical_variants cv ON cv.id = vo.canonical_variant_id
  WHERE vo.id = NEW.vendor_offer_id;

  IF offer_channel IS NULL OR offer_channel <> target_channel THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'NOVA supplier offer commerce channel does not match supplier evidence',
      DETAIL = format('supplier=%s source_product=%s target_channel=%s offer_channel=%s', NEW.supplier_id, NEW.source_product_id, target_channel, COALESCE(offer_channel, '<missing>'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_nova_supplier_offer_channel_guard
  ON public.dropship_supplier_offers;

CREATE TRIGGER catalog_nova_supplier_offer_channel_guard
BEFORE INSERT OR UPDATE OF supplier_id, vendor_offer_id, source_product_id
ON public.dropship_supplier_offers
FOR EACH ROW
EXECUTE FUNCTION bls_private.catalog_nova_supplier_offer_channel_guard();

COMMENT ON FUNCTION bls_private.catalog_nova_retire_channel_transition() IS
  'Fail-closed NOVA condition transition guard. On newly appended immutable supplier evidence, retires the old supplier identity and hides its vendor offer when a SKU crosses normal/BAZAAR channel boundaries, preserving fulfilment history and allowing the materializer to recreate the live identity in the target channel.';

COMMENT ON FUNCTION bls_private.catalog_nova_supplier_offer_channel_guard() IS
  'Database invariant preventing NOVA supplier offers from linking supplier evidence to a canonical in the wrong commerce channel, including during rolling deployments.';

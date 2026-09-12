-- 0236_bazaar_condition_transition_guard.sql
-- Retire the old live supplier identity when immutable NOVA evidence changes its
-- commerce channel, preserving fulfilment history and failing closed.

CREATE OR REPLACE FUNCTION bls_private.catalog_nova_condition_label(payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(btrim(CASE
    WHEN jsonb_typeof(payload->'condition')='string' THEN payload->>'condition'
    WHEN jsonb_typeof(payload->'condition')='object' THEN COALESCE(payload->'condition'->>'name',payload->'condition'->>'label',payload->'condition'->>'value',payload->'condition'->>'title')
    ELSE NULL END),'');
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_nova_commerce_channel(payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH condition_value AS (
    SELECT lower(replace(replace(bls_private.catalog_nova_condition_label(payload),'–','-'),'—','-')) AS label
  )
  SELECT CASE
    WHEN label LIKE '%preloved%' OR label LIKE '%pre-loved%' OR label LIKE '%preowned%' OR label LIKE '%pre-owned%' OR label LIKE '%defect%' OR label LIKE '%damaged%' THEN 'bazaar'
    ELSE 'normal' END
  FROM condition_value;
$$;

CREATE OR REPLACE FUNCTION bls_private.catalog_nova_retire_channel_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,bls_private
AS $$
DECLARE
  supplier_uuid uuid;
  target_channel text;
  variant jsonb;
  external_variant text;
  previous record;
  retired_external_variant text;
BEGIN
  SELECT ds.id INTO supplier_uuid
  FROM public.dropship_suppliers ds
  WHERE ds.catalog_source_id=NEW.source_id AND ds.code='nova_brandsgateway'
  ORDER BY ds.created_at,ds.id LIMIT 1;

  IF supplier_uuid IS NULL THEN RETURN NEW; END IF;
  target_channel := bls_private.catalog_nova_commerce_channel(NEW.normalized_payload);
  IF jsonb_typeof(NEW.normalized_payload->'variants') <> 'array' THEN RETURN NEW; END IF;

  FOR variant IN SELECT value FROM jsonb_array_elements(NEW.normalized_payload->'variants') LOOP
    external_variant := NULLIF(btrim(variant->>'externalVariantId'),'');
    IF external_variant IS NULL THEN CONTINUE; END IF;

    FOR previous IN
      SELECT dso.id AS supplier_offer_id,dso.vendor_offer_id,dso.external_variant_id,COALESCE(cv.commerce_channel,'normal') AS current_channel
      FROM public.dropship_supplier_offers dso
      JOIN public.vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
      WHERE dso.supplier_id=supplier_uuid
        AND dso.external_variant_id=external_variant
        AND COALESCE(cv.commerce_channel,'normal')<>target_channel
      FOR UPDATE OF dso
    LOOP
      UPDATE public.vendor_offers
      SET merchant_visible=false,merchant_pause_active=true,updated_at=now()
      WHERE id=previous.vendor_offer_id;

      retired_external_variant := previous.external_variant_id || '#retired-channel-' || left(replace(previous.supplier_offer_id::text,'-',''),16);
      UPDATE public.dropship_supplier_offers
      SET external_variant_id=retired_external_variant,
          active=false,cached_available=false,cached_quantity=0,
          availability_expires_at=now(),
          availability_payload=COALESCE(availability_payload,'{}'::jsonb) || jsonb_build_object(
            'channelTransitionRetired',true,
            'previousExternalVariantId',previous.external_variant_id,
            'previousCommerceChannel',previous.current_channel,
            'targetCommerceChannel',target_channel,
            'retiredAt',now()),
          updated_at=now()
      WHERE id=previous.supplier_offer_id;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_nova_channel_transition_guard ON public.catalog_source_products;
CREATE TRIGGER catalog_nova_channel_transition_guard
AFTER INSERT ON public.catalog_source_products
FOR EACH ROW EXECUTE FUNCTION bls_private.catalog_nova_retire_channel_transition();

COMMENT ON FUNCTION bls_private.catalog_nova_retire_channel_transition() IS
  'Fail-closed NOVA condition transition guard: retires old supplier identity and hides its vendor offer when a SKU crosses normal/BAZAAR channel boundaries.';

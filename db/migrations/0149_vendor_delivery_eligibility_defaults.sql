-- Make local delivery the marketplace default while keeping pickup-only as an explicit vendor override.
BEGIN;

ALTER TABLE public.vendor_offers
  ALTER COLUMN fulfilment_modes
  SET DEFAULT ARRAY['pickup'::public.fulfilment_mode,'local_delivery'::public.fulfilment_mode];

UPDATE public.vendor_offers
SET fulfilment_modes=ARRAY['pickup'::public.fulfilment_mode,'local_delivery'::public.fulfilment_mode],
    source_payload=COALESCE(source_payload,'{}'::jsonb)||jsonb_build_object(
      'deliveryEligibility','delivery',
      'deliveryEligibilitySource','platform_default',
      'deliveryEligibilityMigratedAt',to_jsonb(now())
    ),
    updated_at=now()
WHERE (
    fulfilment_modes IS NULL
    OR cardinality(fulfilment_modes)=0
    OR fulfilment_modes=ARRAY['pickup'::public.fulfilment_mode]
  )
  AND COALESCE(source_payload->>'deliveryEligibility','') <> 'pickup_only';

CREATE OR REPLACE FUNCTION bls_private.vendor_offer_delivery_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public','bls_private'
AS $function$
BEGIN
  IF COALESCE(NEW.source_payload->>'deliveryEligibility','') <> 'pickup_only'
     AND (
       NEW.fulfilment_modes IS NULL
       OR cardinality(NEW.fulfilment_modes)=0
       OR NEW.fulfilment_modes=ARRAY['pickup'::public.fulfilment_mode]
     ) THEN
    NEW.fulfilment_modes := ARRAY['pickup'::public.fulfilment_mode,'local_delivery'::public.fulfilment_mode];
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS vendor_offer_delivery_default_trigger ON public.vendor_offers;
CREATE TRIGGER vendor_offer_delivery_default_trigger
BEFORE INSERT OR UPDATE OF fulfilment_modes,source_payload
ON public.vendor_offers
FOR EACH ROW
EXECUTE FUNCTION bls_private.vendor_offer_delivery_default();

COMMIT;

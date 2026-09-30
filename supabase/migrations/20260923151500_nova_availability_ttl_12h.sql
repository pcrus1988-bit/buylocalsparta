-- Keep Nova/BrandsGateway availability evidence fresh for 12 hours after each
-- successful authoritative supplier check. The application refresh workers still
-- overwrite availability immediately whenever newer supplier data arrives.

CREATE OR REPLACE FUNCTION public.enforce_nova_availability_ttl_0232()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF NEW.availability_checked_at IS NOT NULL
     AND NEW.availability_expires_at IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.dropship_suppliers ds
       WHERE ds.id = NEW.supplier_id
         AND ds.code = 'nova_brandsgateway'
     )
  THEN
    NEW.availability_expires_at := NEW.availability_checked_at + interval '12 hours';
  END IF;
  RETURN NEW;
END;
$function$;

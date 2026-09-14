-- Keep BAZAAR provenance as part of canonical identity.
-- A canonical may not be repurposed between supplier, return, open-box, display-stock,
-- damaged-packaging, or curated sources by mutating bazaar_source in place.

CREATE OR REPLACE FUNCTION public.enforce_bazaar_source_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.commerce_channel = 'bazaar'
     AND NEW.commerce_channel = 'bazaar'
     AND OLD.bazaar_source IS DISTINCT FROM NEW.bazaar_source THEN
    RAISE EXCEPTION 'BAZAAR canonical provenance is immutable (% -> %) for %',
      OLD.bazaar_source, NEW.bazaar_source, OLD.public_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bazaar_source_immutability ON public.canonical_variants;

CREATE TRIGGER bazaar_source_immutability
BEFORE UPDATE OF bazaar_source ON public.canonical_variants
FOR EACH ROW
EXECUTE FUNCTION public.enforce_bazaar_source_immutability();

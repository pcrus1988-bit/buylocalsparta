BEGIN;

GRANT EXECUTE ON FUNCTION public.vendor_public_slug_base(text)
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION public.assign_vendor_public_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  candidate text;
  suffix text;
BEGIN
  IF NEW.public_slug IS NOT NULL AND pg_catalog.btrim(NEW.public_slug) <> '' THEN
    RETURN NEW;
  END IF;

  candidate := COALESCE(public.vendor_public_slug_base(NEW.trading_name), 'vendor');
  suffix := pg_catalog.lower(
    pg_catalog.right(
      pg_catalog.regexp_replace(
        COALESCE(NEW.public_id, NEW.id::text),
        '[^A-Za-z0-9]',
        '',
        'g'
      ),
      8
    )
  );

  -- Serialize allocation for vendors that normalize to the same base slug.
  -- The lock lasts only for this transaction and avoids check-then-insert races.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(candidate, 0)
  );

  IF candidate = ANY(ARRAY[
    'advice','analytics','catalog','daily-access','dropshipping','finance','hub',
    'login','notifications','orders','pickup','preview','reports','returns',
    'settings','shipping','storefront','trial','trial-expired','trust'
  ]::text[])
     OR EXISTS (
       SELECT 1
       FROM public.vendor_businesses existing
       WHERE existing.public_slug = candidate
     ) THEN
    candidate := pg_catalog.btrim(pg_catalog.left(candidate, 70), '-') || '-' || suffix;
  END IF;

  NEW.public_slug := candidate;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_vendor_public_slug() FROM PUBLIC;

COMMIT;

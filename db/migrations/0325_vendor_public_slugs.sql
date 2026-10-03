-- KONTA MOY — stable public vendor slugs for human-readable storefront URLs.
-- Existing opaque public IDs remain the internal identity and legacy route alias.
-- Slugs are assigned once at insert time so company-name edits do not silently break links.

BEGIN;

ALTER TABLE public.vendor_businesses
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE OR REPLACE FUNCTION public.vendor_public_slug_base(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  slug text := pg_catalog.lower(COALESCE(value, ''));
BEGIN
  slug := pg_catalog.replace(slug, 'ά', 'α');
  slug := pg_catalog.replace(slug, 'έ', 'ε');
  slug := pg_catalog.replace(slug, 'ή', 'η');
  slug := pg_catalog.replace(slug, 'ί', 'ι');
  slug := pg_catalog.replace(slug, 'ό', 'ο');
  slug := pg_catalog.replace(slug, 'ύ', 'υ');
  slug := pg_catalog.replace(slug, 'ώ', 'ω');
  slug := pg_catalog.replace(slug, 'ϊ', 'ι');
  slug := pg_catalog.replace(slug, 'ΐ', 'ι');
  slug := pg_catalog.replace(slug, 'ϋ', 'υ');
  slug := pg_catalog.replace(slug, 'ΰ', 'υ');

  slug := pg_catalog.replace(slug, 'θ', 'th');
  slug := pg_catalog.replace(slug, 'ξ', 'x');
  slug := pg_catalog.replace(slug, 'φ', 'f');
  slug := pg_catalog.replace(slug, 'χ', 'ch');
  slug := pg_catalog.replace(slug, 'ψ', 'ps');
  slug := pg_catalog.translate(slug, 'αβγδεζηικλμνοπρσςτυω', 'avgdeziiklmnoprsstyo');

  slug := pg_catalog.regexp_replace(slug, '[^a-z0-9]+', '-', 'g');
  slug := pg_catalog.btrim(slug, '-');
  slug := pg_catalog.btrim(pg_catalog.left(slug, 80), '-');
  RETURN NULLIF(slug, '');
END;
$$;

WITH bases AS (
  SELECT
    id,
    public_id,
    created_at,
    COALESCE(
      public.vendor_public_slug_base(trading_name),
      'vendor-' || pg_catalog.lower(pg_catalog.right(pg_catalog.regexp_replace(public_id, '[^A-Za-z0-9]', '', 'g'), 8))
    ) AS base_slug
  FROM public.vendor_businesses
),
ranked AS (
  SELECT
    id,
    public_id,
    base_slug,
    row_number() OVER (PARTITION BY base_slug ORDER BY created_at, id) AS rn,
    count(*) OVER (PARTITION BY base_slug) AS duplicate_count
  FROM bases
)
UPDATE public.vendor_businesses AS vendor
SET public_slug = CASE
  WHEN (ranked.duplicate_count = 1 OR ranked.rn = 1)
       AND ranked.base_slug <> ALL(ARRAY[
    'advice','analytics','catalog','daily-access','dropshipping','finance','hub',
    'login','notifications','orders','pickup','preview','reports','returns',
    'settings','shipping','storefront','trial','trial-expired','trust'
  ]::text[])
    THEN ranked.base_slug
  ELSE pg_catalog.btrim(pg_catalog.left(ranked.base_slug, 70), '-') || '-' ||
       pg_catalog.lower(pg_catalog.right(pg_catalog.regexp_replace(ranked.public_id, '[^A-Za-z0-9]', '', 'g'), 8))
END
FROM ranked
WHERE ranked.id = vendor.id
  AND (vendor.public_slug IS NULL OR pg_catalog.btrim(vendor.public_slug) = '');

CREATE UNIQUE INDEX IF NOT EXISTS vendor_businesses_public_slug_uq
  ON public.vendor_businesses (public_slug);

ALTER TABLE public.vendor_businesses
  ALTER COLUMN public_slug SET NOT NULL;

ALTER TABLE public.vendor_businesses
  DROP CONSTRAINT IF EXISTS vendor_businesses_public_slug_format_ck;

ALTER TABLE public.vendor_businesses
  ADD CONSTRAINT vendor_businesses_public_slug_format_ck
  CHECK (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE public.vendor_businesses
  DROP CONSTRAINT IF EXISTS vendor_businesses_public_slug_reserved_ck;

ALTER TABLE public.vendor_businesses
  ADD CONSTRAINT vendor_businesses_public_slug_reserved_ck
  CHECK (public_slug <> ALL(ARRAY[
    'advice','analytics','catalog','daily-access','dropshipping','finance','hub',
    'login','notifications','orders','pickup','preview','reports','returns',
    'settings','shipping','storefront','trial','trial-expired','trust'
  ]::text[]));

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

DROP TRIGGER IF EXISTS vendor_businesses_assign_public_slug ON public.vendor_businesses;

CREATE TRIGGER vendor_businesses_assign_public_slug
BEFORE INSERT ON public.vendor_businesses
FOR EACH ROW
EXECUTE FUNCTION public.assign_vendor_public_slug();

REVOKE ALL ON FUNCTION public.vendor_public_slug_base(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_vendor_public_slug() FROM PUBLIC;

COMMIT;

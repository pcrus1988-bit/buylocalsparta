-- Stable canonical URLs for public Brand Guides.
--
-- This extends the existing canonical brands record; it intentionally does not
-- create a second public-brand model.
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS public_slug text;

WITH candidates AS (
  SELECT
    id,
    public_id,
    trim(
      both '-'
      FROM regexp_replace(lower(normalized_name), '[^a-z0-9]+', '-', 'g')
    ) AS base_slug
  FROM public.brands
),
ranked AS (
  SELECT
    id,
    public_id,
    CASE
      WHEN base_slug <> '' THEN base_slug
      ELSE 'brand-' || left(replace(public_id, '-', ''), 8)
    END AS base_slug,
    count(*) OVER (
      PARTITION BY CASE
        WHEN base_slug <> '' THEN base_slug
        ELSE 'brand-' || left(replace(public_id, '-', ''), 8)
      END
    ) AS collision_count
  FROM candidates
)
UPDATE public.brands AS brand
SET public_slug = CASE
  WHEN ranked.collision_count = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || left(replace(ranked.public_id, '-', ''), 8)
END
FROM ranked
WHERE ranked.id = brand.id
  AND (brand.public_slug IS NULL OR btrim(brand.public_slug) = '');

ALTER TABLE public.brands
  ALTER COLUMN public_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brands_public_slug_key
  ON public.brands (public_slug);

CREATE OR REPLACE FUNCTION bls_private.assign_brand_public_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  candidate text;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.public_slug IS NULL
     OR btrim(NEW.public_slug) = ''
     OR NEW.normalized_name IS DISTINCT FROM OLD.normalized_name
  THEN
    candidate := trim(
      both '-'
      FROM regexp_replace(lower(NEW.normalized_name), '[^a-z0-9]+', '-', 'g')
    );

    IF candidate = '' THEN
      candidate := 'brand-' || left(replace(NEW.public_id, '-', ''), 8);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.brands existing
      WHERE existing.public_slug = candidate
        AND existing.id <> NEW.id
    ) THEN
      candidate := candidate || '-' || left(replace(NEW.public_id, '-', ''), 8);
    END IF;

    NEW.public_slug := candidate;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.assign_brand_public_slug() FROM PUBLIC;

DROP TRIGGER IF EXISTS brands_assign_public_slug ON public.brands;
CREATE TRIGGER brands_assign_public_slug
BEFORE INSERT OR UPDATE OF normalized_name, public_slug
ON public.brands
FOR EACH ROW
EXECUTE FUNCTION bls_private.assign_brand_public_slug();

-- Restore the brand public-slug schema that production already depends on.
-- Migration 0390 consumes brands.public_slug; this canonicalizes the missing
-- pre-0390 history so a clean database can replay the same schema deterministically.

BEGIN;

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE OR REPLACE FUNCTION bls_private.assign_brand_public_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS brands_assign_public_slug ON public.brands;

CREATE TRIGGER brands_assign_public_slug
BEFORE INSERT OR UPDATE OF normalized_name, public_slug ON public.brands
FOR EACH ROW
EXECUTE FUNCTION bls_private.assign_brand_public_slug();

WITH candidates AS (
  SELECT
    id,
    public_id,
    NULLIF(
      trim(
        both '-'
        FROM regexp_replace(lower(normalized_name), '[^a-z0-9]+', '-', 'g')
      ),
      ''
    ) AS base_slug
  FROM public.brands
  WHERE public_slug IS NULL OR btrim(public_slug) = ''
),
ranked AS (
  SELECT
    id,
    public_id,
    COALESCE(base_slug, 'brand-' || left(replace(public_id, '-', ''), 8)) AS base_slug,
    row_number() OVER (
      PARTITION BY COALESCE(base_slug, 'brand-' || left(replace(public_id, '-', ''), 8))
      ORDER BY public_id, id
    ) AS slug_rank
  FROM candidates
)
UPDATE public.brands b
SET public_slug = CASE
  WHEN ranked.slug_rank = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || left(replace(ranked.public_id, '-', ''), 8)
END
FROM ranked
WHERE ranked.id = b.id;

CREATE UNIQUE INDEX IF NOT EXISTS brands_public_slug_key
  ON public.brands(public_slug);

ALTER TABLE public.brands
  ALTER COLUMN public_slug SET NOT NULL;

REVOKE ALL ON FUNCTION bls_private.assign_brand_public_slug() FROM PUBLIC;

COMMIT;

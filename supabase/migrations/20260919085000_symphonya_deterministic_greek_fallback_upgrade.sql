-- Symphonya deterministic Greek fallback: keep AI off the storefront critical path.
--
-- Deterministic fallback titles may be served immediately from product_translations.
-- When validated AI copy arrives later, it may replace only the still-unpublished
-- deterministic fallback values. Existing manual/merchant copy remains authoritative.

BEGIN;

CREATE OR REPLACE FUNCTION public.promote_catalogue_enrichment_translation(
  p_enrichment_id uuid,
  p_canonical_variant_id uuid,
  p_locale text DEFAULT 'el'::text
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  e public.catalogue_enrichments%rowtype;
  v_fallback_title text;
  v_fallback_description text;
BEGIN
  IF p_locale <> 'el' THEN
    RAISE EXCEPTION 'unsupported locale';
  END IF;

  SELECT *
    INTO e
    FROM public.catalogue_enrichments
   WHERE id=p_enrichment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrichment not found';
  END IF;

  IF e.status <> 'enriched'
     OR COALESCE(jsonb_array_length(e.validation_errors),0) <> 0 THEN
    RAISE EXCEPTION 'enrichment is not validated';
  END IF;

  v_fallback_title := NULLIF(btrim(e.deterministic_fallback->>'titleEl'),'');
  v_fallback_description := NULLIF(btrim(e.deterministic_fallback->>'shortDescriptionEl'),'');

  INSERT INTO public.product_translations(
    canonical_variant_id,
    locale,
    title,
    description,
    seo_title,
    seo_description,
    specifications
  )
  VALUES(
    p_canonical_variant_id,
    p_locale,
    e.display_title_el,
    e.display_description_el,
    NULLIF(btrim(e.display_title_el),''),
    NULLIF(btrim(COALESCE(e.display_short_description_el,e.display_description_el)),''),
    '{}'::jsonb
  )
  ON CONFLICT(canonical_variant_id,locale)
  DO UPDATE SET
    title=CASE
      WHEN NULLIF(btrim(public.product_translations.title),'') IS NULL
        THEN EXCLUDED.title
      WHEN e.published_at IS NULL
       AND v_fallback_title IS NOT NULL
       AND btrim(public.product_translations.title)=v_fallback_title
        THEN EXCLUDED.title
      ELSE public.product_translations.title
    END,
    description=CASE
      WHEN NULLIF(btrim(public.product_translations.description),'') IS NULL
        THEN EXCLUDED.description
      WHEN e.published_at IS NULL
       AND v_fallback_description IS NOT NULL
       AND btrim(public.product_translations.description)=v_fallback_description
        THEN EXCLUDED.description
      ELSE public.product_translations.description
    END,
    seo_title=CASE
      WHEN NULLIF(btrim(public.product_translations.seo_title),'') IS NULL
        THEN EXCLUDED.seo_title
      WHEN e.published_at IS NULL
       AND v_fallback_title IS NOT NULL
       AND btrim(public.product_translations.seo_title)=v_fallback_title
        THEN EXCLUDED.seo_title
      ELSE public.product_translations.seo_title
    END,
    seo_description=CASE
      WHEN NULLIF(btrim(public.product_translations.seo_description),'') IS NULL
        THEN EXCLUDED.seo_description
      WHEN e.published_at IS NULL
       AND v_fallback_description IS NOT NULL
       AND btrim(public.product_translations.seo_description)=v_fallback_description
        THEN EXCLUDED.seo_description
      ELSE public.product_translations.seo_description
    END,
    specifications=COALESCE(public.product_translations.specifications,'{}'::jsonb);

  UPDATE public.catalogue_enrichments
     SET published_at=COALESCE(published_at,now()),
         updated_at=now()
   WHERE id=e.id;

  RETURN true;
END
$function$;

COMMIT;

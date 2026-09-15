CREATE TABLE IF NOT EXISTS public.storefront_search_documents (
  canonical_variant_id uuid PRIMARY KEY REFERENCES public.canonical_variants(id) ON DELETE CASCADE,
  document tsvector NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION bls_private.refresh_storefront_search_document(p_canonical_variant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, bls_private
AS $$
  INSERT INTO public.storefront_search_documents (canonical_variant_id, document, updated_at)
  SELECT
    cv.id,
    to_tsvector('simple', concat_ws(' ',
      COALESCE(cv.model,''),
      COALESCE(cv.slug,''),
      COALESCE(cv.gtin,''),
      COALESCE(cv.mpn,''),
      COALESCE(b.name,''),
      COALESCE(c.code,''),
      COALESCE(string_agg(NULLIF(BTRIM(pt.title),''), ' ' ORDER BY pt.locale), '')
    )),
    now()
  FROM public.canonical_variants cv
  JOIN public.categories c ON c.id=cv.category_id
  LEFT JOIN public.product_families pf ON pf.id=cv.family_id
  LEFT JOIN public.brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
  LEFT JOIN public.product_translations pt ON pt.canonical_variant_id=cv.id
  WHERE cv.id=p_canonical_variant_id
  GROUP BY cv.id,b.name,c.code
  ON CONFLICT (canonical_variant_id) DO UPDATE
  SET document=EXCLUDED.document,updated_at=EXCLUDED.updated_at;
$$;

CREATE OR REPLACE FUNCTION bls_private.storefront_search_variant_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,bls_private
AS $$
BEGIN
  PERFORM bls_private.refresh_storefront_search_document(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.storefront_search_translation_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,bls_private
AS $$
DECLARE target_id uuid;
BEGIN
  target_id := CASE WHEN TG_OP='DELETE' THEN OLD.canonical_variant_id ELSE NEW.canonical_variant_id END;
  PERFORM bls_private.refresh_storefront_search_document(target_id);
  RETURN COALESCE(NEW,OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_storefront_search_variant ON public.canonical_variants;
CREATE TRIGGER trg_storefront_search_variant
AFTER INSERT OR UPDATE OF model,slug,gtin,mpn,brand_id,family_id,category_id
ON public.canonical_variants
FOR EACH ROW EXECUTE FUNCTION bls_private.storefront_search_variant_trigger();

DROP TRIGGER IF EXISTS trg_storefront_search_translation ON public.product_translations;
CREATE TRIGGER trg_storefront_search_translation
AFTER INSERT OR UPDATE OF title,locale,canonical_variant_id OR DELETE
ON public.product_translations
FOR EACH ROW EXECUTE FUNCTION bls_private.storefront_search_translation_trigger();

INSERT INTO public.storefront_search_documents (canonical_variant_id,document,updated_at)
SELECT
  cv.id,
  to_tsvector('simple', concat_ws(' ',
    COALESCE(cv.model,''),
    COALESCE(cv.slug,''),
    COALESCE(cv.gtin,''),
    COALESCE(cv.mpn,''),
    COALESCE(b.name,''),
    COALESCE(c.code,''),
    COALESCE(string_agg(NULLIF(BTRIM(pt.title),''), ' ' ORDER BY pt.locale), '')
  )),
  now()
FROM public.canonical_variants cv
JOIN public.categories c ON c.id=cv.category_id
LEFT JOIN public.product_families pf ON pf.id=cv.family_id
LEFT JOIN public.brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
LEFT JOIN public.product_translations pt ON pt.canonical_variant_id=cv.id
GROUP BY cv.id,b.name,c.code
ON CONFLICT (canonical_variant_id) DO UPDATE
SET document=EXCLUDED.document,updated_at=EXCLUDED.updated_at;

CREATE INDEX IF NOT EXISTS storefront_search_documents_document_gin_idx
ON public.storefront_search_documents USING gin(document);

ANALYZE public.storefront_search_documents;

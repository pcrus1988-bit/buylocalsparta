-- Keep customer-facing search index-backed as the supplier catalogue grows.
-- Search intentionally targets titles + canonical identifiers/model/slug + brand/category.
-- Descriptions stay out of the hot search document because indexing/searching long supplier
-- descriptions materially increases latency and produces lower-quality discovery matches.

CREATE INDEX IF NOT EXISTS product_translations_title_fts_gin_idx
ON public.product_translations
USING gin (to_tsvector('simple', COALESCE(title,'')));

CREATE INDEX IF NOT EXISTS canonical_variants_core_search_fts_gin_idx
ON public.canonical_variants
USING gin (
  to_tsvector(
    'simple',
    COALESCE(model,'') || ' ' ||
    COALESCE(slug,'') || ' ' ||
    COALESCE(gtin,'') || ' ' ||
    COALESCE(mpn,'')
  )
);

CREATE INDEX IF NOT EXISTS brands_name_fts_gin_idx
ON public.brands
USING gin (to_tsvector('simple', COALESCE(name,'')));

CREATE INDEX IF NOT EXISTS categories_code_fts_gin_idx
ON public.categories
USING gin (to_tsvector('simple', COALESCE(code,'')));

ANALYZE public.product_translations;
ANALYZE public.canonical_variants;
ANALYZE public.brands;
ANALYZE public.categories;

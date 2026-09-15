-- Keep customer-facing search index-backed as the supplier catalogue grows.
-- The hot path searches translated product titles plus canonical model/slug/identifiers.
-- Long supplier descriptions stay out of the hot search document because they materially
-- increase latency and usually reduce discovery relevance.

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

ANALYZE public.product_translations;
ANALYZE public.canonical_variants;

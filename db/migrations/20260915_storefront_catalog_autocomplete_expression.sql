CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_autocomplete_trgm_idx
  ON public.storefront_catalog_read_model USING gin (
    (lower(title || ' ' || coalesce(brand_name, ''))) gin_trgm_ops
  );

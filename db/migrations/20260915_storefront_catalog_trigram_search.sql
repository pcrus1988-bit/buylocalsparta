CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_title_trgm_idx
  ON public.storefront_catalog_read_model USING gin (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_brand_trgm_idx
  ON public.storefront_catalog_read_model USING gin (lower(brand_name) gin_trgm_ops)
  WHERE brand_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_title_normalized_idx
  ON public.storefront_catalog_read_model(lower(btrim(title)));
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_slug_idx
  ON public.storefront_catalog_read_model(slug);

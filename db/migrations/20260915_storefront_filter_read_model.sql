CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_filter_read_model AS
SELECT
  rm.canonical_variant_id,
  rm.canonical_public_id,
  rm.category_id,
  rm.category_code,
  rm.department_code,
  COALESCE(ctel.name,cten.name,rm.category_code) AS category_label,
  rm.brand_name,
  rm.color,
  rm.sizes,
  rm.fit,
  rm.gtin,
  rm.mpn,
  rm.min_price_minor,
  GREATEST(rm.local_available_until,rm.dropship_available_until) AS available_until,
  rm.search_vector,
  COALESCE(cv.variant_attributes,'{}'::jsonb)
    || COALESCE(en.specifications,'{}'::jsonb)
    || COALESCE(el.specifications,'{}'::jsonb) AS raw_attributes,
  now() AS projected_at
FROM public.storefront_catalog_read_model rm
JOIN public.canonical_variants cv ON cv.id=rm.canonical_variant_id
LEFT JOIN public.product_translations el ON el.canonical_variant_id=rm.canonical_variant_id AND el.locale='el'
LEFT JOIN public.product_translations en ON en.canonical_variant_id=rm.canonical_variant_id AND en.locale='en'
LEFT JOIN public.category_translations ctel ON ctel.category_id=rm.category_id AND ctel.locale='el'
LEFT JOIN public.category_translations cten ON cten.category_id=rm.category_id AND cten.locale='en';

CREATE UNIQUE INDEX IF NOT EXISTS storefront_filter_read_model_uidx
  ON public.storefront_filter_read_model(canonical_variant_id);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_category_idx
  ON public.storefront_filter_read_model(category_code);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_department_idx
  ON public.storefront_filter_read_model(department_code);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_brand_idx
  ON public.storefront_filter_read_model(lower(brand_name)) WHERE brand_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_color_idx
  ON public.storefront_filter_read_model(color) WHERE color IS NOT NULL AND color<>'';
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_sizes_gin
  ON public.storefront_filter_read_model USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_search_gin
  ON public.storefront_filter_read_model USING gin(search_vector);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_raw_attributes_gin
  ON public.storefront_filter_read_model USING gin(raw_attributes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_available_idx
  ON public.storefront_filter_read_model(available_until);

-- Stagger dependent projections so refresh work cannot pile up on the same minute.
SELECT cron.unschedule('refresh-storefront-catalog-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-read-model');
SELECT cron.schedule(
  'refresh-storefront-catalog-read-model',
  '0-59/3 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-dropship-family-read-model',
  '1-59/3 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-filter-read-model',
  '2-59/3 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model'
);

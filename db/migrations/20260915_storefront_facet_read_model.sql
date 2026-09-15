CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_facet_read_model AS
SELECT
  rm.canonical_variant_id,
  rm.category_code,
  rm.department_code,
  COALESCE(ctel.name,cten.name,rm.category_code) AS category_label,
  rm.brand_name,
  rm.color,
  CASE WHEN jsonb_typeof(rm.sizes)='array' THEN rm.sizes ELSE '[]'::jsonb END AS sizes,
  rm.fit,
  rm.gtin,
  rm.mpn,
  rm.min_price_minor,
  GREATEST(rm.local_available_until,rm.dropship_available_until) AS available_until,
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      rm.title,
      COALESCE(rm.brand_name,''),
      COALESCE(rm.gtin,''),
      COALESCE(rm.mpn,''),
      rm.category_code,
      rm.department_code
    )
  ) AS search_vector,
  now() AS projected_at
FROM public.storefront_catalog_read_model rm
LEFT JOIN public.category_translations ctel ON ctel.category_id=rm.category_id AND ctel.locale='el'
LEFT JOIN public.category_translations cten ON cten.category_id=rm.category_id AND cten.locale='en';

CREATE UNIQUE INDEX IF NOT EXISTS storefront_facet_read_model_uidx
  ON public.storefront_facet_read_model(canonical_variant_id);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_category_idx
  ON public.storefront_facet_read_model(category_code);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_department_idx
  ON public.storefront_facet_read_model(department_code);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_brand_idx
  ON public.storefront_facet_read_model(lower(brand_name)) WHERE brand_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_color_idx
  ON public.storefront_facet_read_model(color) WHERE color IS NOT NULL AND color<>'';
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_sizes_gin
  ON public.storefront_facet_read_model USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_fit_idx
  ON public.storefront_facet_read_model(fit) WHERE fit IS NOT NULL AND fit<>'';
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_search_gin
  ON public.storefront_facet_read_model USING gin(search_vector);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_available_idx
  ON public.storefront_facet_read_model(available_until);

-- Stagger refresh work: public discovery can be five minutes stale without
-- compromising checkout because requests still enforce availability expiry and
-- checkout revalidates authoritative stock/pricing.
SELECT cron.unschedule('refresh-storefront-catalog-read-model');
SELECT cron.unschedule('refresh-storefront-dropship-family-read-model');
SELECT cron.unschedule('refresh-storefront-filter-read-model');
SELECT cron.schedule(
  'refresh-storefront-catalog-read-model',
  '0-55/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-dropship-family-read-model',
  '1-56/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-facet-read-model',
  '2-57/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_facet_read_model'
);
SELECT cron.schedule(
  'refresh-storefront-filter-read-model',
  '3-58/10 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model'
);

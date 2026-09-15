CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_family_read_model AS
WITH grouped AS (
  SELECT
    rm.dropship_supplier_id,
    rm.dropship_external_product_id,
    MAX(rm.dropship_available_until) AS available_until,
    MAX(rm.created_at) AS newest_at,
    MIN(rm.min_price_minor) AS min_price_minor,
    MAX(rm.max_msrp_minor) AS max_msrp_minor,
    COALESCE(array_agg(DISTINCT rm.category_code) FILTER (WHERE rm.category_code IS NOT NULL), '{}'::text[]) AS category_codes,
    COALESCE(array_agg(DISTINCT rm.department_code) FILTER (WHERE rm.department_code IS NOT NULL), '{}'::text[]) AS department_codes,
    COALESCE(array_agg(DISTINCT lower(rm.brand_name)) FILTER (WHERE rm.brand_name IS NOT NULL AND btrim(rm.brand_name)<>''), '{}'::text[]) AS brand_names,
    COALESCE(array_agg(DISTINCT rm.color) FILTER (WHERE rm.color IS NOT NULL AND rm.color<>''), '{}'::text[]) AS colors,
    COALESCE(array_agg(DISTINCT rm.fit) FILTER (WHERE rm.fit IS NOT NULL AND rm.fit<>''), '{}'::text[]) AS fits,
    string_agg(DISTINCT rm.sizes::text, ' ') AS sizes_text,
    to_tsvector('simple', string_agg(DISTINCT (
      rm.title || ' ' || coalesce(rm.brand_name,'') || ' ' || coalesce(rm.gtin,'') || ' ' ||
      coalesce(rm.mpn,'') || ' ' || rm.category_code
    ), ' ')) AS search_vector
  FROM public.storefront_catalog_read_model rm
  WHERE rm.dropship_sellable=true
    AND rm.dropship_available_until>now()
    AND rm.dropship_supplier_id IS NOT NULL
    AND rm.dropship_external_product_id IS NOT NULL
  GROUP BY rm.dropship_supplier_id, rm.dropship_external_product_id
)
SELECT g.*, count(*) over()::bigint AS total_families, now() AS projected_at
FROM grouped g;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_family_read_model_uidx
  ON public.storefront_dropship_family_read_model (dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_newest_idx
  ON public.storefront_dropship_family_read_model (newest_at DESC,dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_price_idx
  ON public.storefront_dropship_family_read_model (min_price_minor,dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_categories_gin
  ON public.storefront_dropship_family_read_model USING gin (category_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_departments_gin
  ON public.storefront_dropship_family_read_model USING gin (department_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_brands_gin
  ON public.storefront_dropship_family_read_model USING gin (brand_names);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_colors_gin
  ON public.storefront_dropship_family_read_model USING gin (colors);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_fits_gin
  ON public.storefront_dropship_family_read_model USING gin (fits);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_search_gin
  ON public.storefront_dropship_family_read_model USING gin (search_vector);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_sizes_trgm
  ON public.storefront_dropship_family_read_model USING gin (lower(coalesce(sizes_text,'')) gin_trgm_ops);

SELECT cron.schedule(
  'refresh-storefront-dropship-family-read-model',
  '1-59/2 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model'
);

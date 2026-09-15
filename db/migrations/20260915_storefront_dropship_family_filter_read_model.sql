CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_family_filter_read_model AS
WITH variant_facts AS (
  SELECT
    rm.dropship_supplier_id,
    rm.dropship_external_product_id,
    rm.category_code,
    rm.department_code,
    rm.brand_name,
    NULLIF(BTRIM(COALESCE(NULLIF(rm.color,''),cv.variant_attributes->>'color','')),'') AS color,
    rm.min_price_minor,
    rm.max_msrp_minor,
    rm.created_at,
    rm.dropship_available_until AS available_until,
    rm.title,
    rm.gtin,
    rm.mpn,
    NULLIF(BTRIM(size_entry.value),'') AS size_value
  FROM public.storefront_catalog_read_model rm
  JOIN public.canonical_variants cv ON cv.id=rm.canonical_variant_id
  LEFT JOIN LATERAL unnest(ARRAY[
    cv.variant_attributes->>'italian_size_men',
    cv.variant_attributes->>'italian_size_women',
    cv.variant_attributes->>'shoe_size_women',
    cv.variant_attributes->>'shoe_size_men',
    cv.variant_attributes->>'waist_size',
    cv.variant_attributes->>'belt_size',
    cv.variant_attributes->>'waist_length_size',
    cv.variant_attributes->>'hat_size',
    cv.variant_attributes->>'swimwear_sleepwear_size',
    cv.variant_attributes->>'shoe_size',
    cv.variant_attributes->>'earrings_size',
    cv.variant_attributes->>'bracelets_size',
    cv.variant_attributes->>'gloves_size_women',
    cv.variant_attributes->>'ring_size',
    cv.variant_attributes->>'gloves_size_men',
    cv.variant_attributes->>'size'
  ]) AS size_entry(value) ON true
  WHERE rm.dropship_sellable=true
    AND rm.dropship_available_until>now()
    AND rm.dropship_supplier_id IS NOT NULL
    AND rm.dropship_external_product_id IS NOT NULL
), grouped AS (
  SELECT
    dropship_supplier_id,
    dropship_external_product_id,
    MAX(available_until) AS available_until,
    MAX(created_at) AS newest_at,
    MIN(min_price_minor) AS min_price_minor,
    MAX(max_msrp_minor) AS max_msrp_minor,
    COALESCE(array_agg(DISTINCT category_code) FILTER (WHERE category_code IS NOT NULL),'{}'::text[]) AS category_codes,
    COALESCE(array_agg(DISTINCT department_code) FILTER (WHERE department_code IS NOT NULL),'{}'::text[]) AS department_codes,
    COALESCE(array_agg(DISTINCT brand_name) FILTER (WHERE brand_name IS NOT NULL AND btrim(brand_name)<>''),'{}'::text[]) AS brand_names,
    COALESCE(array_agg(DISTINCT lower(brand_name)) FILTER (WHERE brand_name IS NOT NULL AND btrim(brand_name)<>''),'{}'::text[]) AS brand_names_normalized,
    COALESCE(array_agg(DISTINCT color) FILTER (WHERE color IS NOT NULL AND btrim(color)<>''),'{}'::text[]) AS colors,
    COALESCE(array_agg(DISTINCT size_value) FILTER (WHERE size_value IS NOT NULL),'{}'::text[]) AS sizes,
    to_tsvector('simple',string_agg(DISTINCT (
      title || ' ' || COALESCE(brand_name,'') || ' ' || COALESCE(gtin,'') || ' ' ||
      COALESCE(mpn,'') || ' ' || category_code
    ),' ')) AS search_vector
  FROM variant_facts
  GROUP BY dropship_supplier_id,dropship_external_product_id
)
SELECT grouped.*,COUNT(*) OVER()::bigint AS total_families,now() AS projected_at
FROM grouped;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_family_filter_uidx
  ON public.storefront_dropship_family_filter_read_model(dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_supplier_newest_idx
  ON public.storefront_dropship_family_filter_read_model(dropship_supplier_id,newest_at DESC,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_supplier_price_idx
  ON public.storefront_dropship_family_filter_read_model(dropship_supplier_id,min_price_minor,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_categories_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(category_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_departments_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(department_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_brands_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(brand_names_normalized);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_colors_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(colors);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_sizes_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_search_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(search_vector);

SELECT cron.schedule(
  'refresh-storefront-dropship-family-filter-read-model',
  '4-59/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model'
);

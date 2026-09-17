CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_family_filter_read_model_v2 AS
WITH latest_source_product AS (
  SELECT DISTINCT ON (csp.source_id,csp.source_product_key)
    csp.source_id,
    csp.source_product_key,
    csp.title,
    csp.raw_payload
  FROM public.catalog_source_products csp
  JOIN public.dropship_suppliers ds
    ON ds.catalog_source_id=csp.source_id
   AND ds.active=true
  ORDER BY csp.source_id,csp.source_product_key,csp.created_at DESC,csp.id DESC
), source_attribute_values AS (
  SELECT
    lsp.source_id,
    lsp.source_product_key,
    lower(trim(both ':' from btrim(coalesce(attribute.value->>'name','')))) AS attribute_name,
    btrim(option_value.value) AS option_value
  FROM latest_source_product lsp
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(lsp.raw_payload->'attributes')='array' THEN lsp.raw_payload->'attributes'
      ELSE '[]'::jsonb
    END
  ) attribute(value)
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(attribute.value->'options')='array' THEN attribute.value->'options'
      WHEN jsonb_typeof(attribute.value->'options')='string' THEN jsonb_build_array(attribute.value->'options')
      ELSE '[]'::jsonb
    END
  ) option_value(value)
  WHERE btrim(option_value.value)<>''
), source_colors AS (
  SELECT source_id,source_product_key,
    array_agg(DISTINCT option_value ORDER BY option_value) AS colors
  FROM source_attribute_values
  WHERE attribute_name IN ('color','colour','colors','colours')
  GROUP BY source_id,source_product_key
), source_material_tags AS (
  SELECT DISTINCT
    sav.source_id,
    sav.source_product_key,
    material.tag
  FROM source_attribute_values sav
  CROSS JOIN LATERAL (VALUES
    ('cotton','cotton'),
    ('wool','wool'),
    ('cashmere','cashmere'),
    ('silk','silk'),
    ('linen','linen'),
    ('polyester','polyester'),
    ('viscose','viscose'),
    ('rayon','rayon'),
    ('acrylic','acrylic'),
    ('polyamide','polyamide'),
    ('nylon','nylon'),
    ('elastane','elastane'),
    ('spandex','elastane'),
    ('leather','leather'),
    ('suede','suede'),
    ('denim','denim'),
    ('modal','modal'),
    ('lyocell','lyocell'),
    ('tencel','lyocell'),
    ('acetate','acetate'),
    ('polyurethane','polyurethane'),
    ('rubber','rubber')
  ) AS material(needle,tag)
  WHERE sav.attribute_name IN ('material','materials')
    AND lower(sav.option_value) LIKE '%' || material.needle || '%'
), source_materials AS (
  SELECT source_id,source_product_key,
    array_agg(DISTINCT tag ORDER BY tag) AS materials
  FROM source_material_tags
  GROUP BY source_id,source_product_key
), source_explicit_fits AS (
  SELECT source_id,source_product_key,
    array_agg(DISTINCT lower(option_value) ORDER BY lower(option_value)) AS fits
  FROM source_attribute_values
  WHERE attribute_name IN ('fit','fitting')
  GROUP BY source_id,source_product_key
), source_title_fits AS (
  SELECT
    lsp.source_id,
    lsp.source_product_key,
    array_remove(ARRAY[
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])slim( fit)?([^a-z]|$)' THEN 'slim' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])regular( fit)?([^a-z]|$)' THEN 'regular' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])relaxed( fit)?([^a-z]|$)' THEN 'relaxed' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])oversized([^a-z]|$)' THEN 'oversized' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])skinny( fit)?([^a-z]|$)' THEN 'skinny' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])straight( fit)?([^a-z]|$)' THEN 'straight' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])loose( fit)?([^a-z]|$)' THEN 'loose' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])tapered( fit)?([^a-z]|$)' THEN 'tapered' END
    ]::text[],NULL) AS fits
  FROM latest_source_product lsp
), enriched AS (
  SELECT
    fm.*,
    coalesce(lsp.title,'') AS sort_title,
    COALESCE((
      SELECT array_agg(DISTINCT value ORDER BY value)
      FROM unnest(coalesce(fm.colors,'{}'::text[]) || coalesce(sc.colors,'{}'::text[])) AS merged(value)
      WHERE btrim(value)<>''
    ),'{}'::text[]) AS enriched_colors,
    COALESCE((
      SELECT array_agg(DISTINCT value ORDER BY value)
      FROM unnest(
        coalesce(fr.fits,'{}'::text[])
        || coalesce(sef.fits,'{}'::text[])
        || coalesce(stf.fits,'{}'::text[])
      ) AS merged(value)
      WHERE btrim(value)<>''
    ),'{}'::text[]) AS enriched_fits,
    coalesce(sm.materials,'{}'::text[]) AS materials
  FROM public.storefront_dropship_family_filter_read_model fm
  JOIN public.dropship_suppliers ds
    ON ds.id::text=fm.dropship_supplier_id
  LEFT JOIN latest_source_product lsp
    ON lsp.source_id=ds.catalog_source_id
   AND lsp.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_colors sc
    ON sc.source_id=ds.catalog_source_id
   AND sc.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_materials sm
    ON sm.source_id=ds.catalog_source_id
   AND sm.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_explicit_fits sef
    ON sef.source_id=ds.catalog_source_id
   AND sef.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_title_fits stf
    ON stf.source_id=ds.catalog_source_id
   AND stf.source_product_key=fm.dropship_external_product_id
  LEFT JOIN public.storefront_dropship_family_read_model fr
    ON fr.dropship_supplier_id=fm.dropship_supplier_id
   AND fr.dropship_external_product_id=fm.dropship_external_product_id
)
SELECT
  dropship_supplier_id,
  dropship_external_product_id,
  available_until,
  newest_at,
  min_price_minor,
  max_msrp_minor,
  category_codes,
  department_codes,
  brand_names,
  brand_names_normalized,
  enriched_colors AS colors,
  sizes,
  enriched_fits AS fits,
  materials,
  sort_title,
  search_vector,
  total_families,
  projected_at
FROM enriched;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_uidx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_supplier_newest_idx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,newest_at DESC,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_supplier_price_idx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,min_price_minor,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_supplier_title_idx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,lower(sort_title),dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_categories_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(category_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_brands_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(brand_names_normalized);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_colors_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(colors);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_sizes_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_fits_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(fits);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_materials_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(materials);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_search_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(search_vector);

DO $$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname='refresh-storefront-dropship-family-filter-read-model-v2' LIMIT 1;
  IF existing_job IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job);
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-storefront-dropship-family-filter-read-model-v2',
  '35 * * * *',
  $$SET statement_timeout = '360s'; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model_v2$$
);
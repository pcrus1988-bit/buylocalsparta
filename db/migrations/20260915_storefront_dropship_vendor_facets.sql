CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_vendor_facets AS
WITH base AS (
  SELECT *
  FROM public.storefront_dropship_family_filter_read_model
  WHERE available_until>now()
), totals AS (
  SELECT dropship_supplier_id AS supplier_id,'total'::text AS facet_type,'*'::text AS value,'*'::text AS label,COUNT(*)::int AS count
  FROM base GROUP BY dropship_supplier_id
), category_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'category'::text AS facet_type,category_code.value AS value,
         COALESCE(ctel.name,cten.name,category_code.value) AS label,COUNT(*)::int AS count
  FROM base b
  CROSS JOIN LATERAL unnest(b.category_codes) AS category_code(value)
  LEFT JOIN public.markets m ON m.code='sparta'
  LEFT JOIN public.categories c ON c.market_id=m.id AND c.code=category_code.value
  LEFT JOIN public.category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
  LEFT JOIN public.category_translations cten ON cten.category_id=c.id AND cten.locale='en'
  GROUP BY b.dropship_supplier_id,category_code.value,COALESCE(ctel.name,cten.name,category_code.value)
), brand_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'brand'::text AS facet_type,brand.value AS value,brand.value AS label,COUNT(*)::int AS count
  FROM base b CROSS JOIN LATERAL unnest(b.brand_names) AS brand(value)
  GROUP BY b.dropship_supplier_id,brand.value
), color_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'color'::text AS facet_type,color.value AS value,color.value AS label,COUNT(*)::int AS count
  FROM base b CROSS JOIN LATERAL unnest(b.colors) AS color(value)
  GROUP BY b.dropship_supplier_id,color.value
), size_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'size'::text AS facet_type,size_value.value AS value,size_value.value AS label,COUNT(*)::int AS count
  FROM base b CROSS JOIN LATERAL unnest(b.sizes) AS size_value(value)
  GROUP BY b.dropship_supplier_id,size_value.value
)
SELECT * FROM totals
UNION ALL SELECT * FROM category_values
UNION ALL SELECT * FROM brand_values
UNION ALL SELECT * FROM color_values
UNION ALL SELECT * FROM size_values;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_vendor_facets_uidx
  ON public.storefront_dropship_vendor_facets(supplier_id,facet_type,value,label);
CREATE INDEX IF NOT EXISTS storefront_dropship_vendor_facets_lookup_idx
  ON public.storefront_dropship_vendor_facets(supplier_id,facet_type,label,value);

SELECT cron.schedule(
  'refresh-storefront-dropship-vendor-facets',
  '5-59/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_vendor_facets'
);

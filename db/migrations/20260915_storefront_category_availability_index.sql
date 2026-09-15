-- Homepage/category navigation only needs the tiny set of category/department
-- pairs that still have projected sellable inventory. Keep that lookup index-only
-- instead of reading the wide facet materialized view.
CREATE INDEX IF NOT EXISTS storefront_facet_category_availability_idx
  ON public.storefront_facet_read_model (category_code, department_code, available_until);

COMMENT ON INDEX public.storefront_facet_category_availability_idx IS
  'Covering index for currently available storefront category/department navigation.';

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_dropship_live_cover_idx
  ON public.storefront_catalog_read_model (
    dropship_available_until,
    dropship_supplier_id,
    dropship_external_product_id,
    created_at DESC
  )
  INCLUDE (min_price_minor)
  WHERE dropship_sellable = true
    AND dropship_supplier_id IS NOT NULL
    AND dropship_external_product_id IS NOT NULL;

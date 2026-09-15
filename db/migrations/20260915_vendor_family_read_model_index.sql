CREATE INDEX IF NOT EXISTS storefront_dropship_family_supplier_newest_idx
  ON public.storefront_dropship_family_read_model(
    dropship_supplier_id,
    newest_at DESC,
    dropship_external_product_id
  );

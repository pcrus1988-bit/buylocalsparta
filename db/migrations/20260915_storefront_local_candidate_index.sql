-- Keep local candidate discovery O(page size) even when the imported catalogue is
-- overwhelmingly dropship inventory. The partial index is tiny when no local
-- offers are sellable and supports newest-first storefront/crawler discovery.
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_local_newest_idx
  ON public.storefront_catalog_read_model (created_at DESC, canonical_public_id)
  INCLUDE (canonical_variant_id, department_code, local_available_until, min_price_minor)
  WHERE local_sellable = true;

COMMENT ON INDEX public.storefront_catalog_read_model_local_newest_idx IS
  'Newest-first bounded local storefront candidates; avoids scanning the dropship-heavy read model when local inventory is absent or sparse.';

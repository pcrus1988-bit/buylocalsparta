-- Keep lossless Open Icecat full-snapshot finalization bounded as the provider index grows.
-- The finalizer retires active rows whose last_run_id differs from the completed snapshot.
CREATE INDEX IF NOT EXISTS open_icecat_index_products_finalize_idx
ON public.open_icecat_index_products (source_id, last_run_id)
WHERE record_state = 'active';

ANALYZE public.open_icecat_index_products;

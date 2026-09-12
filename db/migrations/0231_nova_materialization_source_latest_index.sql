-- KONTA MOY — accelerate Nova staged catalogue materialization.
-- Supports the DISTINCT ON latest-source-product scan used by the Nova materializer.
-- This is performance-only: it does not activate offers, change pricing, or enable supplier writes.

BEGIN;

CREATE INDEX IF NOT EXISTS catalog_source_products_source_latest_idx
  ON public.catalog_source_products (source_id, source_product_key, created_at DESC, id DESC);

COMMIT;

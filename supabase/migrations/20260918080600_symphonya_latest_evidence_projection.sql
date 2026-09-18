CREATE INDEX IF NOT EXISTS catalog_source_products_latest_lookup_idx
  ON public.catalog_source_products(source_id,source_product_key,created_at DESC,id DESC);

CREATE OR REPLACE VIEW public.catalog_source_product_latest
WITH (security_invoker=true)
AS
SELECT DISTINCT ON (p.source_id,p.source_product_key)
       p.id,
       p.snapshot_id,
       p.source_id,
       p.source_taxonomy_node_id,
       p.source_product_key,
       p.supplier_code,
       p.title,
       p.source_url,
       p.source_image_url,
       p.source_identity,
       p.raw_payload,
       p.normalized_payload,
       p.quality_payload,
       p.price_state,
       p.classification_status,
       p.created_at
  FROM public.catalog_source_products p
 ORDER BY p.source_id,p.source_product_key,p.created_at DESC,p.id DESC;

COMMENT ON VIEW public.catalog_source_product_latest IS
  'Latest immutable evidence row per (source_id, source_product_key). Source history remains append-only in catalog_source_products.';

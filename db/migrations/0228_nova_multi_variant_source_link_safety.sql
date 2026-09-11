-- KONTA MOY — Nova multi-variant source-link safety.
-- Nova source products are product-level records that may contain multiple sellable variants.
-- The global catalogue invariant still permits only one approved canonical link per source product.
-- Automatic Nova staging therefore keeps the first approved representative link and silently skips
-- additional automatic approved links for sibling variants; variant-level traceability remains on
-- dropship_supplier_offers -> vendor_offers -> canonical_variants.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.guard_nova_multi_variant_approved_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  IF NEW.link_status='approved'
     AND NEW.reviewed_by IS NULL
     AND NEW.match_method IN ('exact_gtin','enrichment')
     AND EXISTS (
       SELECT 1
       FROM public.catalog_source_products csp
       JOIN public.catalog_sources cs ON cs.id=csp.source_id
       WHERE csp.id=NEW.source_product_id
         AND cs.code='nova-brandsgateway'
     )
     AND EXISTS (
       SELECT 1
       FROM public.catalog_source_product_links existing
       WHERE existing.source_product_id=NEW.source_product_id
         AND existing.link_status='approved'
         AND existing.canonical_variant_id IS DISTINCT FROM NEW.canonical_variant_id
     ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_nova_multi_variant_approved_link
  ON public.catalog_source_product_links;

CREATE TRIGGER trg_guard_nova_multi_variant_approved_link
BEFORE INSERT ON public.catalog_source_product_links
FOR EACH ROW
EXECUTE FUNCTION bls_private.guard_nova_multi_variant_approved_link();

GRANT EXECUTE ON FUNCTION bls_private.guard_nova_multi_variant_approved_link()
  TO bls_app_runtime,bls_platform_runtime;

COMMENT ON FUNCTION bls_private.guard_nova_multi_variant_approved_link() IS
  'Preserves the one-approved-link-per-source-product invariant while allowing automatic Nova staging to materialize every supplier variant. Additional automatic sibling-variant links are skipped; manual reviewed decisions still fail closed on uniqueness conflicts.';

COMMIT;

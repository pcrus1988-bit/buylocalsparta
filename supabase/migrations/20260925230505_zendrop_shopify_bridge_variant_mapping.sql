-- KONTA MOY — durable Zendrop -> hidden Shopify bridge variant mapping.
-- The bridge store is infrastructure only; customer commerce remains on KONTA MOY.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dropship_shopify_bridge_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.dropship_suppliers(id) ON DELETE CASCADE,
  supplier_offer_id uuid REFERENCES public.dropship_supplier_offers(id) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  external_variant_id text NOT NULL,
  external_sku text,
  shop_domain text NOT NULL,
  shopify_product_id text NOT NULL,
  shopify_variant_id text NOT NULL,
  zendrop_import_list_id bigint,
  sync_status text NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('staged','syncing','synced','error','disabled')),
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dropship_shopify_bridge_variant_external_key
    UNIQUE (supplier_id, external_variant_id),
  CONSTRAINT dropship_shopify_bridge_variant_shopify_key
    UNIQUE (supplier_id, shopify_variant_id),
  CONSTRAINT dropship_shopify_bridge_variant_product_nonempty
    CHECK (length(btrim(external_product_id)) > 0),
  CONSTRAINT dropship_shopify_bridge_variant_variant_nonempty
    CHECK (length(btrim(external_variant_id)) > 0),
  CONSTRAINT dropship_shopify_bridge_variant_domain_nonempty
    CHECK (length(btrim(shop_domain)) > 0),
  CONSTRAINT dropship_shopify_bridge_variant_shopify_product_nonempty
    CHECK (length(btrim(shopify_product_id)) > 0),
  CONSTRAINT dropship_shopify_bridge_variant_shopify_variant_nonempty
    CHECK (length(btrim(shopify_variant_id)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS dropship_shopify_bridge_variant_offer_uidx
  ON public.dropship_shopify_bridge_variants(supplier_offer_id)
  WHERE supplier_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dropship_shopify_bridge_variant_product_idx
  ON public.dropship_shopify_bridge_variants(supplier_id, external_product_id, sync_status);

ALTER TABLE public.dropship_shopify_bridge_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.dropship_shopify_bridge_variants
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT,INSERT,UPDATE,DELETE ON public.dropship_shopify_bridge_variants TO bls_platform_runtime;

COMMENT ON TABLE public.dropship_shopify_bridge_variants IS
  'Private infrastructure mapping from supplier variants to hidden Shopify bridge variants used only for Zendrop order relay.';
COMMENT ON COLUMN public.dropship_shopify_bridge_variants.shopify_variant_id IS
  'Numeric Shopify variant id as returned by the hidden bridge store; converted to a gid at runtime.';
COMMENT ON COLUMN public.dropship_shopify_bridge_variants.metadata IS
  'Non-secret synchronization evidence only. Credentials must remain in server-side environment variables.';

COMMIT;

-- Generic dropship supplier engine v2.
-- Supplier/source identity is deliberately separate from the KONTA MOU commercial vendor.
-- API credentials are never stored here; they belong in server-side environment secrets.

CREATE TABLE IF NOT EXISTS public.dropship_suppliers (
  code text PRIMARY KEY,
  name text NOT NULL,
  commercial_vendor_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  shipping_strategy text NOT NULL DEFAULT 'MANUAL'
    CHECK (shipping_strategy IN ('API_QUOTE', 'RATE_TABLE', 'FIXED', 'ABSORBED', 'MANUAL')),
  source_locale text,
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute > 0),
  non_secret_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_capabilities (
  supplier_code text PRIMARY KEY REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  csv_bootstrap boolean NOT NULL DEFAULT false,
  catalogue_delta boolean NOT NULL DEFAULT false,
  deleted_feed boolean NOT NULL DEFAULT false,
  bulk_status_check boolean NOT NULL DEFAULT false,
  product_lookup boolean NOT NULL DEFAULT false,
  create_order boolean NOT NULL DEFAULT false,
  read_orders boolean NOT NULL DEFAULT false,
  tracking boolean NOT NULL DEFAULT false,
  shipping_quote boolean NOT NULL DEFAULT false,
  cancel_order boolean NOT NULL DEFAULT false,
  returns boolean NOT NULL DEFAULT false,
  webhooks boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_sync_state (
  supplier_code text PRIMARY KEY REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  external_store_id text,
  catalogue_watermark timestamptz,
  deletion_watermark timestamptz,
  last_catalogue_sync_at timestamptz,
  last_deletion_sync_at timestamptz,
  last_order_sync_at timestamptz,
  csv_enabled boolean,
  csv_download_count integer,
  csv_download_limit integer,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_products (
  id bigserial PRIMARY KEY,
  supplier_code text NOT NULL REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  external_product_id text NOT NULL,
  external_source_vendor_id text,
  external_source_vendor_name text,
  source_language text,
  source_name text,
  source_description text,
  source_sku text,
  barcode text,
  mpn text,
  brand_id text,
  brand_name text,
  regular_price_raw text,
  sale_price_raw text,
  canonical_product_id text,
  source_status text NOT NULL DEFAULT 'ACTIVE' CHECK (source_status IN ('ACTIVE', 'WITHDRAWN')),
  publication_state text NOT NULL DEFAULT 'STAGED'
    CHECK (publication_state IN ('STAGED', 'PUBLISHABLE', 'LIVE', 'WITHDRAWN', 'BLOCKED')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  source_updated_at timestamptz,
  deleted_at timestamptz,
  reactivated_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_code, external_product_id)
);

CREATE INDEX IF NOT EXISTS dropship_supplier_products_barcode_idx
  ON public.dropship_supplier_products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS dropship_supplier_products_brand_mpn_idx
  ON public.dropship_supplier_products(brand_name, mpn) WHERE mpn IS NOT NULL;
CREATE INDEX IF NOT EXISTS dropship_supplier_products_publication_idx
  ON public.dropship_supplier_products(supplier_code, publication_state, source_status);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_variants (
  id bigserial PRIMARY KEY,
  supplier_product_id bigint NOT NULL REFERENCES public.dropship_supplier_products(id) ON DELETE CASCADE,
  external_variation_id text NOT NULL,
  canonical_variant_id text,
  sku text,
  barcode text,
  mpn text,
  stock_quantity integer,
  stock_status text,
  in_stock boolean NOT NULL DEFAULT false,
  manage_stock boolean NOT NULL DEFAULT false,
  backorders_allowed boolean NOT NULL DEFAULT false,
  regular_price_raw text,
  sale_price_raw text,
  weight_raw text,
  dimensions jsonb,
  hs_code text,
  attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_product_id, external_variation_id)
);

CREATE INDEX IF NOT EXISTS dropship_supplier_variants_barcode_idx
  ON public.dropship_supplier_variants(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS dropship_supplier_variants_sku_idx
  ON public.dropship_supplier_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS dropship_supplier_variants_stock_idx
  ON public.dropship_supplier_variants(in_stock, stock_quantity);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_media (
  id bigserial PRIMARY KEY,
  supplier_product_id bigint NOT NULL REFERENCES public.dropship_supplier_products(id) ON DELETE CASCADE,
  external_variation_id text,
  source_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  media_role text NOT NULL DEFAULT 'GALLERY',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_product_id, source_url)
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_categories (
  id bigserial PRIMARY KEY,
  supplier_code text NOT NULL REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  external_category_id text NOT NULL,
  parent_external_category_id text,
  name text NOT NULL,
  slug text,
  description text,
  product_count integer,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_code, external_category_id)
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_category_mappings (
  id bigserial PRIMARY KEY,
  supplier_code text NOT NULL REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  external_category_id text NOT NULL,
  canonical_category_id text,
  mapping_state text NOT NULL DEFAULT 'UNMAPPED'
    CHECK (mapping_state IN ('UNMAPPED', 'SUGGESTED', 'CONFIRMED', 'REJECTED')),
  confidence numeric(5,4),
  mapping_source text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_code, external_category_id)
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_offers (
  id bigserial PRIMARY KEY,
  supplier_code text NOT NULL REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  supplier_variant_id bigint NOT NULL REFERENCES public.dropship_supplier_variants(id) ON DELETE CASCADE,
  commercial_vendor_id text NOT NULL,
  fulfilment_mode text NOT NULL DEFAULT 'DROPSHIP' CHECK (fulfilment_mode = 'DROPSHIP'),
  available boolean NOT NULL DEFAULT false,
  stock_quantity integer,
  regular_price_raw text,
  sale_price_raw text,
  buying_price_minor bigint,
  retail_price_minor bigint,
  msrp_minor bigint,
  pricing_verified boolean NOT NULL DEFAULT false,
  price_currency text,
  last_stock_verified_at timestamptz,
  last_price_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_code, supplier_variant_id)
);

CREATE INDEX IF NOT EXISTS dropship_supplier_offers_vendor_available_idx
  ON public.dropship_supplier_offers(commercial_vendor_id, available);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_price_snapshots (
  id bigserial PRIMARY KEY,
  supplier_variant_id bigint NOT NULL REFERENCES public.dropship_supplier_variants(id) ON DELETE CASCADE,
  regular_price_raw text,
  sale_price_raw text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS dropship_supplier_price_snapshots_variant_time_idx
  ON public.dropship_supplier_price_snapshots(supplier_variant_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_orders (
  id bigserial PRIMARY KEY,
  supplier_code text NOT NULL REFERENCES public.dropship_suppliers(code) ON DELETE RESTRICT,
  kontamou_order_id text NOT NULL,
  kontamou_fulfilment_id text NOT NULL,
  external_order_id text,
  submission_state text NOT NULL DEFAULT 'NOT_SUBMITTED'
    CHECK (submission_state IN ('NOT_SUBMITTED', 'SUBMITTING', 'SUBMITTED', 'SUBMISSION_UNKNOWN', 'FAILED')),
  supplier_status text,
  request_hash text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  submitted_at timestamptz,
  last_reconciled_at timestamptz,
  request_payload jsonb,
  response_payload jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_code, kontamou_fulfilment_id),
  UNIQUE (supplier_code, external_order_id)
);

CREATE INDEX IF NOT EXISTS dropship_supplier_orders_reconcile_idx
  ON public.dropship_supplier_orders(supplier_code, submission_state, supplier_status);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_order_items (
  id bigserial PRIMARY KEY,
  supplier_order_id bigint NOT NULL REFERENCES public.dropship_supplier_orders(id) ON DELETE CASCADE,
  kontamou_order_line_id text,
  supplier_variant_id bigint REFERENCES public.dropship_supplier_variants(id) ON DELETE SET NULL,
  external_product_id text NOT NULL,
  external_variation_id text,
  supplier_sku text,
  quantity integer NOT NULL CHECK (quantity > 0),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_shipments (
  id bigserial PRIMARY KEY,
  supplier_order_id bigint NOT NULL REFERENCES public.dropship_supplier_orders(id) ON DELETE CASCADE,
  carrier text,
  tracking_number text,
  external_source_vendor_id text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_order_id, carrier, tracking_number)
);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_sync_runs (
  id bigserial PRIMARY KEY,
  supplier_code text NOT NULL REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  sync_kind text NOT NULL CHECK (sync_kind IN ('BOOTSTRAP', 'CATALOGUE_DELTA', 'DELETIONS', 'STATUS', 'ORDERS', 'RECONCILIATION')),
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL')),
  watermark_from timestamptz,
  watermark_to timestamptz,
  records_read integer NOT NULL DEFAULT 0,
  records_written integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary text
);

CREATE INDEX IF NOT EXISTS dropship_supplier_sync_runs_supplier_time_idx
  ON public.dropship_supplier_sync_runs(supplier_code, started_at DESC);

CREATE TABLE IF NOT EXISTS public.dropship_supplier_errors (
  id bigserial PRIMARY KEY,
  supplier_code text NOT NULL REFERENCES public.dropship_suppliers(code) ON DELETE CASCADE,
  sync_run_id bigint REFERENCES public.dropship_supplier_sync_runs(id) ON DELETE SET NULL,
  external_product_id text,
  external_order_id text,
  error_code text,
  message text NOT NULL,
  retryable boolean NOT NULL DEFAULT false,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS dropship_supplier_errors_open_idx
  ON public.dropship_supplier_errors(supplier_code, occurred_at DESC) WHERE resolved_at IS NULL;

-- Source records are private operational data. Application access is expected via server/service-role code.
ALTER TABLE public.dropship_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_category_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dropship_supplier_errors ENABLE ROW LEVEL SECURITY;

INSERT INTO public.dropship_suppliers (
  code,
  name,
  commercial_vendor_id,
  enabled,
  shipping_strategy,
  source_locale,
  rate_limit_per_minute,
  non_secret_config
) VALUES (
  'nova_brandsgateway',
  'Nova / BrandsGateway',
  'vendor_e8cb57b3c67b469d9a9d',
  false,
  'MANUAL',
  'en',
  60,
  '{"api_version":"v1","base_url":"https://nova.shopwoo.com/api/v1","backorders_enabled":false,"pricing_semantics_verified":false}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  commercial_vendor_id = EXCLUDED.commercial_vendor_id,
  shipping_strategy = EXCLUDED.shipping_strategy,
  rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
  non_secret_config = public.dropship_suppliers.non_secret_config || EXCLUDED.non_secret_config,
  updated_at = now();

INSERT INTO public.dropship_supplier_capabilities (
  supplier_code,
  csv_bootstrap,
  catalogue_delta,
  deleted_feed,
  bulk_status_check,
  product_lookup,
  create_order,
  read_orders,
  tracking,
  shipping_quote,
  cancel_order,
  returns,
  webhooks
) VALUES (
  'nova_brandsgateway',
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  false,
  false,
  false,
  false
)
ON CONFLICT (supplier_code) DO UPDATE SET
  csv_bootstrap = EXCLUDED.csv_bootstrap,
  catalogue_delta = EXCLUDED.catalogue_delta,
  deleted_feed = EXCLUDED.deleted_feed,
  bulk_status_check = EXCLUDED.bulk_status_check,
  product_lookup = EXCLUDED.product_lookup,
  create_order = EXCLUDED.create_order,
  read_orders = EXCLUDED.read_orders,
  tracking = EXCLUDED.tracking,
  shipping_quote = EXCLUDED.shipping_quote,
  cancel_order = EXCLUDED.cancel_order,
  returns = EXCLUDED.returns,
  webhooks = EXCLUDED.webhooks,
  updated_at = now();

INSERT INTO public.dropship_supplier_sync_state (supplier_code)
VALUES ('nova_brandsgateway')
ON CONFLICT (supplier_code) DO NOTHING;

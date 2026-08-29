-- Buy Local Sparta — durable Open Icecat bulk-index ingestion state.
-- Index rows are operational staging only. They are not catalog_source_products,
-- canonical products, offers, inventory, or publication approvals. Full Open Icecat
-- product detail must still pass the existing 0158 Greek-quality/source governance.

BEGIN;

CREATE TABLE public.open_icecat_bulk_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id),
  import_kind text NOT NULL CHECK (import_kind IN ('full','daily')),
  source_url text NOT NULL,
  source_fingerprint text NOT NULL,
  processing_version text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed')),
  checkpoint bigint NOT NULL DEFAULT 0 CHECK (checkpoint >= 0),
  source_rows bigint NOT NULL DEFAULT 0 CHECK (source_rows >= 0),
  persisted bigint NOT NULL DEFAULT 0 CHECK (persisted >= 0),
  removed bigint NOT NULL DEFAULT 0 CHECK (removed >= 0),
  rejected bigint NOT NULL DEFAULT 0 CHECK (rejected >= 0),
  filtered bigint NOT NULL DEFAULT 0 CHECK (filtered >= 0),
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  UNIQUE (source_id, import_kind, source_fingerprint, processing_version),
  CHECK (length(btrim(source_url)) > 0),
  CHECK (length(btrim(source_fingerprint)) > 0),
  CHECK (length(btrim(processing_version)) > 0),
  CHECK (source_rows = checkpoint),
  CHECK (persisted + removed + rejected + filtered = source_rows),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR failed_at IS NOT NULL)
);

CREATE INDEX open_icecat_bulk_ingestion_runs_status_idx
  ON public.open_icecat_bulk_ingestion_runs(status, updated_at DESC);
CREATE INDEX open_icecat_bulk_ingestion_runs_source_idx
  ON public.open_icecat_bulk_ingestion_runs(source_id, started_at DESC);

COMMENT ON TABLE public.open_icecat_bulk_ingestion_runs IS
  'Durable source-row cursor and counters for resumable Open Icecat full/daily index ingestion. A completed run records index staging only and never grants publication eligibility.';
COMMENT ON COLUMN public.open_icecat_bulk_ingestion_runs.checkpoint IS
  'Zero-based source-row resume boundary expressed as the number of terminal data records durably committed; header and blank records are excluded.';
COMMENT ON COLUMN public.open_icecat_bulk_ingestion_runs.processing_version IS
  'Parser/filter semantics version. A durable checkpoint may only be resumed by the same processing version.';
COMMENT ON COLUMN public.open_icecat_bulk_ingestion_runs.persisted IS
  'Accepted Open Icecat index candidate rows written to operational index staging. This is not a canonical-product or publication count.';

CREATE TABLE public.open_icecat_index_products (
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  path text NOT NULL,
  source_updated text,
  quality text,
  supplier_id text,
  product_code text,
  category_id text,
  mapped_product_code text,
  gtins text[] NOT NULL DEFAULT ARRAY[]::text[],
  on_market boolean,
  country_markets text[] NOT NULL DEFAULT ARRAY[]::text[],
  model_name text,
  product_views bigint CHECK (product_views IS NULL OR product_views >= 0),
  high_pic text,
  gtins_approved boolean,
  limited boolean,
  record_state text NOT NULL DEFAULT 'active'
    CHECK (record_state IN ('active','removed')),
  last_source_fingerprint text NOT NULL,
  last_run_id uuid NOT NULL REFERENCES public.open_icecat_bulk_ingestion_runs(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (source_id, product_id),
  CHECK (length(btrim(product_id)) > 0),
  CHECK (length(btrim(path)) > 0),
  CHECK (length(btrim(last_source_fingerprint)) > 0),
  CHECK (record_state <> 'removed' OR removed_at IS NOT NULL),
  CHECK (record_state <> 'active' OR removed_at IS NULL)
);

CREATE INDEX open_icecat_index_products_state_idx
  ON public.open_icecat_index_products(source_id, record_state, last_seen_at DESC);
CREATE INDEX open_icecat_index_products_gtins_idx
  ON public.open_icecat_index_products USING gin(gtins);
CREATE INDEX open_icecat_index_products_category_idx
  ON public.open_icecat_index_products(source_id, category_id)
  WHERE category_id IS NOT NULL;

COMMENT ON TABLE public.open_icecat_index_products IS
  'Operational normalized Open Icecat index staging. Rows identify candidates/removals for later detail enrichment; they are deliberately isolated from governed source-product evidence and all public commerce tables.';
COMMENT ON COLUMN public.open_icecat_index_products.record_state IS
  'Provider-index presence only. active does not mean Greek-quality approved, canonical, sellable, in stock, or public.';

ALTER TABLE public.open_icecat_bulk_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_icecat_index_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.open_icecat_bulk_ingestion_runs
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY bls_platform_runtime_all ON public.open_icecat_index_products
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.open_icecat_bulk_ingestion_runs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.open_icecat_index_products FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.open_icecat_bulk_ingestion_runs TO bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.open_icecat_index_products TO bls_platform_runtime;

COMMIT;

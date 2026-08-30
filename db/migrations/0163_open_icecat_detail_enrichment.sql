-- Buy Local Sparta — durable Open Icecat product-detail enrichment queue.
-- Converts active provider-index candidates into provenance-bearing source-product
-- evidence without granting canonical, commercial, inventory, or publication status.

BEGIN;

CREATE TABLE public.open_icecat_detail_enrichment_jobs (
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  last_run_id uuid NOT NULL REFERENCES public.open_icecat_bulk_ingestion_runs(id),
  source_updated text,
  processing_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','ready','needs_enrichment','retry','failed','skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_owner text,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  source_product_id uuid REFERENCES public.catalog_source_products(id) ON DELETE SET NULL,
  last_error text,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, product_id),
  FOREIGN KEY (source_id, product_id)
    REFERENCES public.open_icecat_index_products(source_id, product_id) ON DELETE CASCADE,
  CHECK (length(btrim(product_id)) > 0),
  CHECK (length(btrim(processing_version)) > 0),
  CHECK (lease_owner IS NULL OR length(btrim(lease_owner)) > 0),
  CHECK (
    (status='processing' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL)
    OR
    (status<>'processing' AND lease_owner IS NULL AND lease_until IS NULL)
  ),
  CHECK (
    status NOT IN ('ready','needs_enrichment','failed','skipped')
    OR completed_at IS NOT NULL
  )
);

CREATE INDEX open_icecat_detail_jobs_claim_idx
  ON public.open_icecat_detail_enrichment_jobs(status, next_attempt_at, updated_at)
  WHERE status IN ('pending','retry','processing');

CREATE INDEX open_icecat_detail_jobs_source_product_idx
  ON public.open_icecat_detail_enrichment_jobs(source_product_id)
  WHERE source_product_id IS NOT NULL;

COMMENT ON TABLE public.open_icecat_detail_enrichment_jobs IS
  'Durable per-product queue for transforming Open Icecat index staging into governed catalog_source_products and EL localization evidence. Queue success never grants canonical/public/commercial status.';
COMMENT ON COLUMN public.open_icecat_detail_enrichment_jobs.processing_version IS
  'Detail-fetch/normalization semantics version. Changing it requeues the provider index row for fresh governed evidence.';
COMMENT ON COLUMN public.open_icecat_detail_enrichment_jobs.source_product_id IS
  'Latest source-product evidence produced for the queued index version. It is not a canonical variant, vendor offer, stock record, or publication approval.';

ALTER TABLE public.open_icecat_detail_enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.open_icecat_detail_enrichment_jobs
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.open_icecat_detail_enrichment_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.open_icecat_detail_enrichment_jobs TO bls_platform_runtime;

COMMIT;

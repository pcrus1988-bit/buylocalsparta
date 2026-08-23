-- Buy Local Sparta — web catalogue crawl acquisition layer.
-- The crawler is an isolated acquisition worker. These tables hold crawl configuration,
-- execution evidence and extracted candidates before promotion into the existing supplier PIM.
-- No row created here is a sellable offer or a public product.

BEGIN;

CREATE TABLE public.catalog_web_crawl_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  profile_code text NOT NULL DEFAULT 'main',
  root_url text NOT NULL,
  allowed_hosts text[] NOT NULL,
  allow_subdomains boolean NOT NULL DEFAULT false,
  allow_http boolean NOT NULL DEFAULT false,
  obey_robots boolean NOT NULL DEFAULT true,
  fetch_mode text NOT NULL DEFAULT 'auto'
    CHECK (fetch_mode IN ('auto','http','browser')),
  max_pages integer NOT NULL DEFAULT 10000
    CHECK (max_pages > 0 AND max_pages <= 250000),
  max_depth integer NOT NULL DEFAULT 12
    CHECK (max_depth >= 0 AND max_depth <= 64),
  max_concurrency integer NOT NULL DEFAULT 4
    CHECK (max_concurrency > 0 AND max_concurrency <= 32),
  requests_per_second numeric(8,3) NOT NULL DEFAULT 1
    CHECK (requests_per_second > 0 AND requests_per_second <= 20),
  max_response_bytes bigint NOT NULL DEFAULT 10485760
    CHECK (max_response_bytes > 0 AND max_response_bytes <= 52428800),
  max_redirects integer NOT NULL DEFAULT 5
    CHECK (max_redirects >= 0 AND max_redirects <= 10),
  include_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclude_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  extractor_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, profile_code),
  UNIQUE (id, source_id),
  CHECK (length(btrim(profile_code)) > 0),
  CHECK (root_url ~ '^https?://'),
  CHECK (cardinality(allowed_hosts) > 0)
);

COMMENT ON TABLE public.catalog_web_crawl_profiles IS
  'Admin-managed crawl policy for an existing catalog source. Runtime workers must still perform DNS/IP/redirect SSRF validation; allowed_hosts is not a substitute for network isolation.';
COMMENT ON COLUMN public.catalog_web_crawl_profiles.obey_robots IS
  'Whether the acquisition worker must honor robots directives for this source. Enabled by default.';
COMMENT ON COLUMN public.catalog_web_crawl_profiles.allow_http IS
  'Explicit exception for legacy HTTP sources. HTTPS is required by default.';

CREATE TABLE public.catalog_web_crawl_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES public.catalog_sources(id) ON DELETE CASCADE,
  crawl_mode text NOT NULL DEFAULT 'full'
    CHECK (crawl_mode IN ('discovery','full','category','single')),
  seed_url text,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_snapshot jsonb NOT NULL,
  extractor_version text NOT NULL,
  idempotency_key text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','partial','failed','cancelled')),
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  discovered_url_count integer NOT NULL DEFAULT 0 CHECK (discovered_url_count >= 0),
  fetched_page_count integer NOT NULL DEFAULT 0 CHECK (fetched_page_count >= 0),
  skipped_page_count integer NOT NULL DEFAULT 0 CHECK (skipped_page_count >= 0),
  failed_page_count integer NOT NULL DEFAULT 0 CHECK (failed_page_count >= 0),
  extracted_product_count integer NOT NULL DEFAULT 0 CHECK (extracted_product_count >= 0),
  review_product_count integer NOT NULL DEFAULT 0 CHECK (review_product_count >= 0),
  promoted_product_count integer NOT NULL DEFAULT 0 CHECK (promoted_product_count >= 0),
  snapshot_id uuid REFERENCES public.catalog_source_snapshots(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, source_id)
    REFERENCES public.catalog_web_crawl_profiles(id, source_id) ON DELETE CASCADE,
  CHECK (length(btrim(extractor_version)) > 0),
  CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0),
  CHECK (status <> 'running' OR started_at IS NOT NULL),
  CHECK (status NOT IN ('succeeded','partial','failed','cancelled') OR completed_at IS NOT NULL)
);

CREATE UNIQUE INDEX catalog_web_crawl_jobs_idempotency_uidx
  ON public.catalog_web_crawl_jobs(profile_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX catalog_web_crawl_jobs_status_idx
  ON public.catalog_web_crawl_jobs(status,created_at);
CREATE INDEX catalog_web_crawl_jobs_source_idx
  ON public.catalog_web_crawl_jobs(source_id,created_at DESC);

COMMENT ON TABLE public.catalog_web_crawl_jobs IS
  'One isolated web acquisition run. policy_snapshot freezes the security/rate-limit policy used by the worker for auditability.';
COMMENT ON COLUMN public.catalog_web_crawl_jobs.snapshot_id IS
  'Set only after accepted crawl candidates are promoted into an immutable catalog_source_snapshot.';

CREATE TABLE public.catalog_web_crawl_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.catalog_web_crawl_jobs(id) ON DELETE CASCADE,
  discovered_from_page_id uuid REFERENCES public.catalog_web_crawl_pages(id) ON DELETE SET NULL,
  url text NOT NULL,
  normalized_url text NOT NULL,
  depth integer NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 64),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','fetching','fetched','skipped','failed')),
  skip_reason text,
  robots_allowed boolean,
  resolved_addresses inet[] NOT NULL DEFAULT ARRAY[]::inet[],
  fetch_mode text
    CHECK (fetch_mode IS NULL OR fetch_mode IN ('http','browser')),
  http_status integer CHECK (http_status IS NULL OR (http_status >= 100 AND http_status <= 599)),
  content_type text,
  response_bytes bigint CHECK (response_bytes IS NULL OR response_bytes >= 0),
  response_sha256 text
    CHECK (response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
  etag text,
  last_modified_header text,
  redirect_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  product_likelihood numeric(6,5)
    CHECK (product_likelihood IS NULL OR (product_likelihood >= 0 AND product_likelihood <= 1)),
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','not_applicable','extracted','review_required','failed')),
  fetched_at timestamptz,
  failure_kind text,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, normalized_url),
  CHECK (length(btrim(url)) > 0),
  CHECK (length(btrim(normalized_url)) > 0),
  CHECK (status <> 'fetched' OR fetched_at IS NOT NULL)
);

CREATE INDEX catalog_web_crawl_pages_job_status_idx
  ON public.catalog_web_crawl_pages(job_id,status,depth);
CREATE INDEX catalog_web_crawl_pages_extraction_idx
  ON public.catalog_web_crawl_pages(job_id,extraction_status)
  WHERE extraction_status <> 'not_applicable';

COMMENT ON TABLE public.catalog_web_crawl_pages IS
  'Per-URL crawl evidence including DNS addresses, redirects, response hash and extraction status. Response bodies are not stored here.';

CREATE TABLE public.catalog_web_product_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.catalog_web_crawl_pages(id) ON DELETE CASCADE,
  extraction_version text NOT NULL,
  ordinal integer NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  source_product_key text NOT NULL,
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate','accepted','review_required','rejected','promoted')),
  confidence numeric(6,5) NOT NULL
    CHECK (confidence >= 0 AND confidence <= 1),
  extracted_payload jsonb NOT NULL,
  field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  promoted_source_product_id uuid REFERENCES public.catalog_source_products(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  promoted_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, extraction_version, ordinal),
  CHECK (length(btrim(extraction_version)) > 0),
  CHECK (length(btrim(source_product_key)) > 0),
  CHECK (status <> 'accepted' OR accepted_at IS NOT NULL),
  CHECK (status <> 'promoted' OR (promoted_source_product_id IS NOT NULL AND promoted_at IS NOT NULL))
);

CREATE INDEX catalog_web_product_extractions_status_idx
  ON public.catalog_web_product_extractions(status,created_at);
CREATE INDEX catalog_web_product_extractions_source_key_idx
  ON public.catalog_web_product_extractions(source_product_key);

COMMENT ON TABLE public.catalog_web_product_extractions IS
  'Operational extraction candidates with per-field provenance. Promotion writes immutable source evidence into catalog_source_products; this table never publishes directly.';

ALTER TABLE public.catalog_web_crawl_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_web_crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_web_crawl_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_web_product_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalog_web_crawl_profiles
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.catalog_web_crawl_jobs
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.catalog_web_crawl_pages
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.catalog_web_product_extractions
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE public.catalog_web_crawl_profiles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.catalog_web_crawl_jobs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.catalog_web_crawl_pages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.catalog_web_product_extractions FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_web_crawl_profiles TO bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_web_crawl_jobs TO bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_web_crawl_pages TO bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_web_product_extractions TO bls_platform_runtime;

COMMIT;

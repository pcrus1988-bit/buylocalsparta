-- NYXI — canonical corpus foundation.
-- Source definitions live in data/nyxi/source-registry.json.
-- This migration creates only durable evidence infrastructure; it does not seed
-- source definitions or interpret product/formula/regulatory content.

BEGIN;

CREATE TABLE public.nyxi_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE
    CHECK (source_key ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  publisher text NOT NULL CHECK (length(btrim(publisher)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  source_family text NOT NULL CHECK (source_family IN (
    'law',
    'regulatory_database',
    'scientific_opinion_index',
    'chemical_hazard_registry',
    'recall_system',
    'regulatory_guidance',
    'manufacturer_root',
    'manufacturer_product',
    'manufacturer_sds',
    'manufacturer_catalogue',
    'authorised_distributor',
    'retailer',
    'scientific_literature',
    'historical_archive'
  )),
  authority_level smallint NOT NULL CHECK (authority_level BETWEEN 1 AND 5),
  jurisdiction text NOT NULL DEFAULT 'GLOBAL'
    CHECK (length(btrim(jurisdiction)) BETWEEN 2 AND 32),
  language text NOT NULL DEFAULT 'en'
    CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  canonical_url text NOT NULL UNIQUE CHECK (canonical_url ~ '^https://'),
  retrieval_method text NOT NULL DEFAULT 'html'
    CHECK (retrieval_method IN ('html','pdf','json','csv','rss','api','sitemap','manual')),
  official boolean NOT NULL DEFAULT false,
  legally_binding boolean NOT NULL DEFAULT false,
  regulatory boolean NOT NULL DEFAULT false,
  manufacturer_primary boolean NOT NULL DEFAULT false,
  source_status text NOT NULL DEFAULT 'verified'
    CHECK (source_status IN ('candidate','verified','deprecated','blocked')),
  update_frequency text NOT NULL DEFAULT 'unknown'
    CHECK (update_frequency IN (
      'continuous','daily','weekly','monthly','quarterly','annual',
      'event_driven','irregular','unknown'
    )),
  coverage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(coverage)='object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_sources_family_authority_idx
  ON public.nyxi_sources(source_family,authority_level DESC,source_status)
  WHERE source_status='verified';

CREATE INDEX nyxi_sources_jurisdiction_idx
  ON public.nyxi_sources(jurisdiction,regulatory,source_status)
  WHERE source_status='verified';

CREATE TABLE public.nyxi_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  capture_kind text NOT NULL DEFAULT 'metadata'
    CHECK (capture_kind IN ('metadata','headers','excerpt','full_text','raw_file')),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_type text,
  content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  raw_object_key text,
  byte_length bigint CHECK (byte_length IS NULL OR byte_length >= 0),
  etag text,
  last_modified text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX nyxi_source_snapshots_content_unique_idx
  ON public.nyxi_source_snapshots(source_id,content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX nyxi_source_snapshots_latest_idx
  ON public.nyxi_source_snapshots(source_id,retrieved_at DESC);

CREATE TABLE public.nyxi_source_crawl_state (
  source_id uuid PRIMARY KEY REFERENCES public.nyxi_sources(id) ON DELETE CASCADE,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_http_status integer CHECK (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599),
  last_content_sha256 char(64)
    CHECK (last_content_sha256 IS NULL OR last_content_sha256 ~ '^[a-f0-9]{64}$'),
  etag text,
  last_modified text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error text,
  lease_owner text,
  lease_expires_at timestamptz,
  last_success_at timestamptz,
  last_change_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_source_crawl_due_idx
  ON public.nyxi_source_crawl_state(next_check_at,lease_expires_at)
  WHERE next_check_at IS NOT NULL;

CREATE TABLE public.nyxi_research_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN (
    'brand','jurisdiction','ingredient','regulation','recall_system','scientific_topic'
  )),
  target_key text NOT NULL CHECK (length(btrim(target_key)) > 0),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  research_status text NOT NULL DEFAULT 'queued'
    CHECK (research_status IN ('queued','in_progress','covered','needs_review','paused')),
  required_source_families text[] NOT NULL DEFAULT '{}'::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_type,target_key)
);

CREATE INDEX nyxi_research_targets_queue_idx
  ON public.nyxi_research_targets(research_status,priority DESC,created_at);

CREATE TABLE public.nyxi_source_target_links (
  source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.nyxi_research_targets(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'covers'
    CHECK (relation IN ('covers','primary_for','mentions','supersedes','historical_for')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_id,target_id,relation)
);

CREATE TABLE public.nyxi_source_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_url text NOT NULL UNIQUE CHECK (canonical_url ~ '^https://'),
  discovered_from_source_id uuid REFERENCES public.nyxi_sources(id) ON DELETE SET NULL,
  discovery_method text NOT NULL CHECK (discovery_method IN (
    'manual','official_link','sitemap','robots','redirect',
    'regulator_index','manufacturer_index','search'
  )),
  publisher_hint text,
  title_hint text,
  source_family_hint text,
  jurisdiction_hint text,
  candidate_status text NOT NULL DEFAULT 'candidate'
    CHECK (candidate_status IN ('candidate','verified','rejected','duplicate','unreachable')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_http_status integer CHECK (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599),
  last_content_sha256 char(64)
    CHECK (last_content_sha256 IS NULL OR last_content_sha256 ~ '^[a-f0-9]{64}$'),
  etag text,
  last_modified text,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error text,
  lease_owner text,
  lease_expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_source_candidates_review_idx
  ON public.nyxi_source_candidates(candidate_status,last_seen_at DESC)
  WHERE candidate_status='candidate';

CREATE INDEX nyxi_source_candidates_capture_due_idx
  ON public.nyxi_source_candidates(next_check_at,lease_expires_at,first_seen_at)
  WHERE candidate_status='candidate'
    AND discovered_from_source_id IS NOT NULL
    AND next_check_at IS NOT NULL;

CREATE TABLE public.nyxi_source_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN (
    'changed','unchanged','not_modified','http_error','fetch_error'
  )),
  requested_url text NOT NULL CHECK (requested_url ~ '^https://'),
  final_url text CHECK (final_url IS NULL OR final_url ~ '^https://'),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint CHECK (byte_length IS NULL OR byte_length >= 0),
  etag text,
  last_modified text,
  error_message text,
  worker_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_source_checks_source_time_idx
  ON public.nyxi_source_checks(source_id,checked_at DESC);

CREATE INDEX nyxi_source_checks_outcome_time_idx
  ON public.nyxi_source_checks(outcome,checked_at DESC);

CREATE TABLE public.nyxi_source_candidate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.nyxi_source_candidates(id) ON DELETE RESTRICT,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_type text,
  content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  raw_object_key text,
  byte_length bigint CHECK (byte_length IS NULL OR byte_length >= 0),
  etag text,
  last_modified text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX nyxi_source_candidate_snapshots_content_uidx
  ON public.nyxi_source_candidate_snapshots(candidate_id,content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX nyxi_source_candidate_snapshots_latest_idx
  ON public.nyxi_source_candidate_snapshots(candidate_id,retrieved_at DESC);

CREATE TABLE public.nyxi_source_candidate_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.nyxi_source_candidates(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN (
    'changed','unchanged','not_modified','http_error','fetch_error'
  )),
  requested_url text NOT NULL CHECK (requested_url ~ '^https://'),
  final_url text CHECK (final_url IS NULL OR final_url ~ '^https://'),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint CHECK (byte_length IS NULL OR byte_length >= 0),
  etag text,
  last_modified text,
  error_message text,
  worker_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX nyxi_source_candidate_checks_time_idx
  ON public.nyxi_source_candidate_checks(candidate_id,checked_at DESC);

ALTER TABLE public.nyxi_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_crawl_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_research_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_target_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_candidate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_candidate_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_nyxi_sources_runtime_all ON public.nyxi_sources
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_source_snapshots_runtime_select ON public.nyxi_source_snapshots
  FOR SELECT TO bls_app_runtime, bls_platform_runtime USING (true);
CREATE POLICY bls_nyxi_source_snapshots_runtime_insert ON public.nyxi_source_snapshots
  FOR INSERT TO bls_app_runtime, bls_platform_runtime WITH CHECK (true);
CREATE POLICY bls_nyxi_source_crawl_state_runtime_all ON public.nyxi_source_crawl_state
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_research_targets_runtime_all ON public.nyxi_research_targets
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_source_target_links_runtime_all ON public.nyxi_source_target_links
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_source_candidates_runtime_all ON public.nyxi_source_candidates
  FOR ALL TO bls_app_runtime, bls_platform_runtime
  USING (true) WITH CHECK (true);
CREATE POLICY bls_nyxi_source_checks_runtime_select ON public.nyxi_source_checks
  FOR SELECT TO bls_app_runtime, bls_platform_runtime USING (true);
CREATE POLICY bls_nyxi_source_checks_runtime_insert ON public.nyxi_source_checks
  FOR INSERT TO bls_app_runtime, bls_platform_runtime WITH CHECK (true);
CREATE POLICY bls_nyxi_candidate_snapshots_runtime_select ON public.nyxi_source_candidate_snapshots
  FOR SELECT TO bls_app_runtime, bls_platform_runtime USING (true);
CREATE POLICY bls_nyxi_candidate_snapshots_runtime_insert ON public.nyxi_source_candidate_snapshots
  FOR INSERT TO bls_app_runtime, bls_platform_runtime WITH CHECK (true);
CREATE POLICY bls_nyxi_candidate_checks_runtime_select ON public.nyxi_source_candidate_checks
  FOR SELECT TO bls_app_runtime, bls_platform_runtime USING (true);
CREATE POLICY bls_nyxi_candidate_checks_runtime_insert ON public.nyxi_source_candidate_checks
  FOR INSERT TO bls_app_runtime, bls_platform_runtime WITH CHECK (true);

REVOKE ALL ON TABLE
  public.nyxi_sources,
  public.nyxi_source_snapshots,
  public.nyxi_source_crawl_state,
  public.nyxi_research_targets,
  public.nyxi_source_target_links,
  public.nyxi_source_candidates,
  public.nyxi_source_checks,
  public.nyxi_source_candidate_snapshots,
  public.nyxi_source_candidate_checks
FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE ON TABLE public.nyxi_sources
  TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT ON TABLE
  public.nyxi_source_snapshots,
  public.nyxi_source_checks,
  public.nyxi_source_candidate_snapshots,
  public.nyxi_source_candidate_checks
TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.nyxi_source_crawl_state,
  public.nyxi_research_targets,
  public.nyxi_source_target_links
TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.nyxi_source_candidates
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.nyxi_sources IS
  'Canonical NYXI source identity and authority registry. Source definitions are synchronized from data/nyxi/source-registry.json; presence here is not a product, ingredient, safety or legal conclusion.';
COMMENT ON TABLE public.nyxi_source_snapshots IS
  'Append-only immutable capture metadata for verified NYXI sources. Exact bytes live in private content-addressed object storage.';
COMMENT ON TABLE public.nyxi_source_checks IS
  'Append-only source retrieval ledger including unchanged, 304 and failure outcomes.';
COMMENT ON TABLE public.nyxi_source_candidates IS
  'Unverified source-discovery ledger. Discovery or raw capture never implies authority.';
COMMENT ON TABLE public.nyxi_source_candidate_snapshots IS
  'Append-only raw capture metadata for unverified candidates. Candidate capture never implies verification.';
COMMENT ON TABLE public.nyxi_source_candidate_checks IS
  'Append-only retrieval ledger for unverified candidates.';
COMMENT ON TABLE public.nyxi_research_targets IS
  'Independent NYXI research queue, deliberately not foreign-keyed to the KONTA MOY commercial catalogue.';

COMMIT;

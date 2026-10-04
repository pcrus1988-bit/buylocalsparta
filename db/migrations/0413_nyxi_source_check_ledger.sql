-- NYXI Phase 0 append-only retrieval evidence ledger.
-- Every source check is retained independently from raw snapshot creation so
-- NYXI can later show when a source was checked even when its bytes did not change.

BEGIN;

CREATE TABLE public.nyxi_source_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN (
    'changed',
    'unchanged',
    'not_modified',
    'http_error',
    'fetch_error'
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

ALTER TABLE public.nyxi_source_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_nyxi_source_checks_runtime_select ON public.nyxi_source_checks
  FOR SELECT TO bls_app_runtime, bls_platform_runtime
  USING (true);

CREATE POLICY bls_nyxi_source_checks_runtime_insert ON public.nyxi_source_checks
  FOR INSERT TO bls_app_runtime, bls_platform_runtime
  WITH CHECK (true);

REVOKE ALL ON TABLE public.nyxi_source_checks
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT ON TABLE public.nyxi_source_checks
  TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.nyxi_source_checks IS
  'Append-only NYXI source retrieval ledger. Records every check outcome, including unchanged and failed checks, without duplicating raw source bytes.';
COMMENT ON COLUMN public.nyxi_source_checks.content_sha256 IS
  'SHA-256 of the observed representation when known. Raw evidence is resolved through nyxi_source_snapshots/source archive rather than duplicated here.';
COMMENT ON COLUMN public.nyxi_source_checks.metadata IS
  'Transport/check provenance only. Semantic extraction and safety interpretation are outside Phase 0.';

COMMIT;

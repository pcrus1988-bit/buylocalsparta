-- NYXI Phase 0 candidate evidence acquisition.
-- Structurally discovered URLs remain unverified, but their exact raw bytes may
-- be captured before they disappear. Capture never promotes candidate authority.

BEGIN;

ALTER TABLE public.nyxi_source_candidates
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN next_check_at timestamptz,
  ADD COLUMN last_http_status integer CHECK (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599),
  ADD COLUMN last_content_sha256 char(64)
    CHECK (last_content_sha256 IS NULL OR last_content_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN etag text,
  ADD COLUMN last_modified text,
  ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  ADD COLUMN last_error text,
  ADD COLUMN lease_owner text,
  ADD COLUMN lease_expires_at timestamptz;

UPDATE public.nyxi_source_candidates
SET next_check_at=now()
WHERE candidate_status='candidate'
  AND discovered_from_source_id IS NOT NULL
  AND next_check_at IS NULL;

CREATE INDEX nyxi_source_candidates_capture_due_idx
  ON public.nyxi_source_candidates(next_check_at,lease_expires_at,first_seen_at)
  WHERE candidate_status='candidate'
    AND discovered_from_source_id IS NOT NULL
    AND next_check_at IS NOT NULL;

CREATE TABLE public.nyxi_source_candidate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.nyxi_source_candidates(id) ON DELETE CASCADE,
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
  candidate_id uuid NOT NULL REFERENCES public.nyxi_source_candidates(id) ON DELETE CASCADE,
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

CREATE INDEX nyxi_source_candidate_checks_time_idx
  ON public.nyxi_source_candidate_checks(candidate_id,checked_at DESC);

ALTER TABLE public.nyxi_source_candidate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nyxi_source_candidate_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_nyxi_candidate_snapshots_runtime_select
  ON public.nyxi_source_candidate_snapshots
  FOR SELECT TO bls_app_runtime, bls_platform_runtime
  USING (true);

CREATE POLICY bls_nyxi_candidate_snapshots_runtime_insert
  ON public.nyxi_source_candidate_snapshots
  FOR INSERT TO bls_app_runtime, bls_platform_runtime
  WITH CHECK (true);

CREATE POLICY bls_nyxi_candidate_checks_runtime_select
  ON public.nyxi_source_candidate_checks
  FOR SELECT TO bls_app_runtime, bls_platform_runtime
  USING (true);

CREATE POLICY bls_nyxi_candidate_checks_runtime_insert
  ON public.nyxi_source_candidate_checks
  FOR INSERT TO bls_app_runtime, bls_platform_runtime
  WITH CHECK (true);

REVOKE ALL ON TABLE
  public.nyxi_source_candidate_snapshots,
  public.nyxi_source_candidate_checks
FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT ON TABLE
  public.nyxi_source_candidate_snapshots,
  public.nyxi_source_candidate_checks
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.nyxi_source_candidate_snapshots IS
  'Immutable raw captures of structurally discovered NYXI candidates. Capture does not imply source verification or authority.';
COMMENT ON TABLE public.nyxi_source_candidate_checks IS
  'Append-only transport history for unverified candidate acquisition. No semantic interpretation or automatic verification occurs.';
COMMENT ON COLUMN public.nyxi_source_candidates.next_check_at IS
  'Schedules raw acquisition of an unverified candidate only. It does not schedule or imply source verification.';

COMMIT;

-- Buy Local Sparta — AI product import persistence.
-- Persists inferred schema profiles and normalized rows before any PIM/canonical mutation.

BEGIN;

CREATE TABLE public.catalog_import_mapping_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  source_code text NOT NULL,
  profile_key char(64) NOT NULL,
  engine_version text NOT NULL,
  normalizer_version text NOT NULL,
  delimiter text NOT NULL CHECK (delimiter IN (',',';','tab','|')),
  headers jsonb NOT NULL DEFAULT '[]'::jsonb,
  mappings jsonb NOT NULL DEFAULT '[]'::jsonb,
  unmapped_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  ambiguous_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  mapped_coverage numeric(6,5) NOT NULL CHECK (mapped_coverage >= 0 AND mapped_coverage <= 1),
  identity_coverage numeric(6,5) NOT NULL CHECK (identity_coverage >= 0 AND identity_coverage <= 1),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','approved','superseded','rejected')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,source_code,profile_key),
  CHECK (length(btrim(source_code)) > 0)
);

CREATE TABLE public.catalog_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  source_code text NOT NULL,
  source_name text NOT NULL,
  source_filename text NOT NULL,
  source_sha256 char(64) NOT NULL,
  engine_version text NOT NULL,
  normalizer_version text NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.catalog_import_mapping_profiles(id),
  status text NOT NULL DEFAULT 'normalized'
    CHECK (status IN ('normalized','pim_staged','canonicalized','rejected')),
  row_count integer NOT NULL CHECK (row_count >= 0),
  ready_rows integer NOT NULL DEFAULT 0 CHECK (ready_rows >= 0),
  review_rows integer NOT NULL DEFAULT 0 CHECK (review_rows >= 0),
  quarantine_rows integer NOT NULL DEFAULT 0 CHECK (quarantine_rows >= 0),
  duplicate_source_key_count integer NOT NULL DEFAULT 0 CHECK (duplicate_source_key_count >= 0),
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot_id uuid REFERENCES public.catalog_source_snapshots(id) ON DELETE SET NULL,
  target_vendor_id uuid REFERENCES public.vendor_businesses(id) ON DELETE SET NULL,
  target_location_id uuid REFERENCES public.vendor_locations(id) ON DELETE SET NULL,
  canonicalization_result jsonb,
  failure_reason text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,source_code,source_sha256,normalizer_version),
  CHECK (length(btrim(source_code)) > 0),
  CHECK (length(btrim(source_name)) > 0),
  CHECK (length(btrim(source_filename)) > 0)
);

CREATE TABLE public.catalog_import_row_decisions (
  run_id uuid NOT NULL REFERENCES public.catalog_import_runs(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number >= 2),
  source_key text NOT NULL,
  identity_confidence numeric(6,5) NOT NULL CHECK (identity_confidence >= 0 AND identity_confidence <= 1),
  triage_status text NOT NULL
    CHECK (triage_status IN ('ready_for_identity_matching','needs_mapping_review','quarantine')),
  reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,row_number),
  CHECK (length(btrim(source_key)) > 0)
);

CREATE INDEX catalog_import_profiles_source_idx
  ON public.catalog_import_mapping_profiles(market_id,source_code,status,updated_at DESC);
CREATE INDEX catalog_import_runs_source_idx
  ON public.catalog_import_runs(market_id,source_code,status,created_at DESC);
CREATE INDEX catalog_import_runs_snapshot_idx
  ON public.catalog_import_runs(source_snapshot_id)
  WHERE source_snapshot_id IS NOT NULL;
CREATE INDEX catalog_import_rows_triage_idx
  ON public.catalog_import_row_decisions(run_id,triage_status,row_number);
CREATE INDEX catalog_import_rows_source_key_idx
  ON public.catalog_import_row_decisions(run_id,source_key);

COMMENT ON TABLE public.catalog_import_mapping_profiles IS
  'Versioned source-schema interpretation produced by Product Intelligence. Profiles are evidence and can be superseded without mutating source rows.';
COMMENT ON TABLE public.catalog_import_runs IS
  'Governed AI product import run. Normalization is persisted before PIM staging; canonicalization/public commerce remain separate transitions.';
COMMENT ON TABLE public.catalog_import_row_decisions IS
  'Per-row normalized evidence and triage decision. Quarantined rows never enter the PIM automatically.';

ALTER TABLE public.catalog_import_mapping_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_import_row_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON public.catalog_import_mapping_profiles
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.catalog_import_runs
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON public.catalog_import_row_decisions
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON public.catalog_import_mapping_profiles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.catalog_import_runs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.catalog_import_row_decisions FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.catalog_import_mapping_profiles TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.catalog_import_runs TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.catalog_import_row_decisions TO bls_platform_runtime;

COMMIT;

-- KONTA MOY — external canonical release archive evidence.
-- Schema 0433 separates "the database can reconstruct this release" from
-- "the exact canonical bytes were persisted and read back from object storage".
--
-- The application uses content-addressed object keys and refuses overwrite-on-
-- mismatch. True storage-layer WORM / S3 Object Lock remains an infrastructure
-- property and is not claimed by this schema.

BEGIN;

CREATE TABLE public.research_release_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_snapshot_id uuid NOT NULL UNIQUE
    REFERENCES public.research_release_snapshots(id) ON DELETE RESTRICT,
  study_id uuid NOT NULL REFERENCES public.research_studies(id) ON DELETE RESTRICT,
  wave_id uuid NOT NULL,
  storage_provider text NOT NULL DEFAULT 'object_storage'
    CHECK (storage_provider IN ('object_storage')),
  object_key text NOT NULL UNIQUE
    CHECK (object_key LIKE 'research/releases/%'),
  artifact_sha256 text NOT NULL
    CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  content_type text NOT NULL DEFAULT 'application/json'
    CHECK (content_type = 'application/json'),
  storage_etag text,
  archive_contract text NOT NULL DEFAULT 'content_addressed_no_overwrite_v1'
    CHECK (archive_contract IN ('content_addressed_no_overwrite_v1')),
  verification_version text NOT NULL DEFAULT 'sha256_readback_v1'
    CHECK (verification_version = 'sha256_readback_v1'),
  archived_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz NOT NULL DEFAULT now(),
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_release_archives_wave_study_fk
    FOREIGN KEY (wave_id,study_id)
    REFERENCES public.research_waves(id,study_id)
    ON DELETE RESTRICT,
  CONSTRAINT research_release_archives_verification_time_check
    CHECK (verified_at >= archived_at)
);

CREATE INDEX research_release_archives_study_wave_idx
  ON public.research_release_archives(study_id,wave_id,archived_at DESC);

ALTER TABLE public.research_release_archives ENABLE ROW LEVEL SECURITY;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.research_release_archives FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.research_release_archives FROM authenticated;
  END IF;
END;
$research$;

GRANT SELECT,INSERT ON TABLE public.research_release_archives TO bls_platform_runtime;

CREATE POLICY research_release_archives_platform_runtime
ON public.research_release_archives
FOR ALL TO bls_platform_runtime
USING ((SELECT bls_private.is_platform_runtime()))
WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE OR REPLACE FUNCTION public.research_guard_release_archive_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $research$
DECLARE
  release_study_id uuid;
  release_wave_id uuid;
  release_artifact_sha256 text;
BEGIN
  SELECT study_id,wave_id,artifact_sha256
  INTO release_study_id,release_wave_id,release_artifact_sha256
  FROM public.research_release_snapshots
  WHERE id=NEW.release_snapshot_id;

  IF release_study_id IS NULL THEN
    RAISE EXCEPTION 'research release archive references an unknown release snapshot';
  END IF;
  IF release_study_id IS DISTINCT FROM NEW.study_id
     OR release_wave_id IS DISTINCT FROM NEW.wave_id THEN
    RAISE EXCEPTION 'research release archive study/wave scope mismatch';
  END IF;
  IF release_artifact_sha256 IS NULL
     OR release_artifact_sha256 IS DISTINCT FROM NEW.artifact_sha256 THEN
    RAISE EXCEPTION 'research release archive artifact hash mismatch';
  END IF;

  RETURN NEW;
END;
$research$;

CREATE TRIGGER research_release_archives_00_scope_guard
BEFORE INSERT ON public.research_release_archives
FOR EACH ROW EXECUTE FUNCTION public.research_guard_release_archive_insert();

CREATE TRIGGER research_release_archives_append_only
BEFORE UPDATE OR DELETE ON public.research_release_archives
FOR EACH ROW EXECUTE FUNCTION public.prevent_history_mutation();

REVOKE EXECUTE ON FUNCTION public.research_guard_release_archive_insert() FROM PUBLIC;

DO $research$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_release_archive_insert() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE EXECUTE ON FUNCTION public.research_guard_release_archive_insert() FROM authenticated;
  END IF;
END;
$research$;

GRANT EXECUTE ON FUNCTION public.research_guard_release_archive_insert() TO bls_platform_runtime;

COMMIT;

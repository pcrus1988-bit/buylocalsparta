-- Buy Local Sparta — governed private transport for supplier catalogue source imports.
-- Payloads are operational staging only. They are checksum-sealed before use and
-- cleared after a successful import; canonical/source evidence remains in the 0117 PIM tables.

BEGIN;

CREATE TABLE catalog_source_import_payloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code text NOT NULL,
  source_filename text NOT NULL,
  importer_version text NOT NULL,
  compression text NOT NULL DEFAULT 'gzip'
    CHECK (compression IN ('gzip')),
  expected_source_sha256 text NOT NULL,
  expected_compressed_sha256 text NOT NULL,
  expected_row_count integer NOT NULL CHECK (expected_row_count > 0),
  payload bytea,
  compressed_size bigint CHECK (compressed_size IS NULL OR compressed_size >= 0),
  status text NOT NULL DEFAULT 'staging'
    CHECK (status IN ('staging','ready','imported','rejected')),
  imported_snapshot_id uuid REFERENCES catalog_source_snapshots(id) ON DELETE SET NULL,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sealed_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_code, expected_source_sha256, importer_version),
  CHECK (length(btrim(source_code)) > 0),
  CHECK (length(btrim(source_filename)) > 0),
  CHECK (length(btrim(importer_version)) > 0),
  CHECK (expected_source_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (expected_compressed_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (status <> 'ready' OR (payload IS NOT NULL AND sealed_at IS NOT NULL AND compressed_size = octet_length(payload))),
  CHECK (status <> 'imported' OR (imported_snapshot_id IS NOT NULL AND imported_at IS NOT NULL AND payload IS NULL))
);

COMMENT ON TABLE catalog_source_import_payloads IS
  'Private operational staging for compressed supplier source files. A payload must be checksum-sealed before import and is cleared after successful promotion into immutable PIM evidence.';
COMMENT ON COLUMN catalog_source_import_payloads.expected_source_sha256 IS
  'SHA-256 of the decompressed original source file. Verified by the importer before any PIM write.';
COMMENT ON COLUMN catalog_source_import_payloads.expected_compressed_sha256 IS
  'SHA-256 of the staged compressed bytes. Verified inside PostgreSQL when the payload is sealed.';

CREATE INDEX catalog_source_import_payloads_status_idx
  ON catalog_source_import_payloads(status,created_at DESC);

ALTER TABLE catalog_source_import_payloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON catalog_source_import_payloads
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON TABLE catalog_source_import_payloads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_source_import_payloads TO bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.guard_catalog_source_import_payload_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,extensions,bls_private
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('imported','rejected') THEN
      RAISE EXCEPTION 'catalog source import payload may only be deleted after imported/rejected';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('imported','rejected') THEN
      RAISE EXCEPTION 'catalog source import payload is terminal';
    END IF;

    IF NEW.source_code IS DISTINCT FROM OLD.source_code
      OR NEW.source_filename IS DISTINCT FROM OLD.source_filename
      OR NEW.importer_version IS DISTINCT FROM OLD.importer_version
      OR NEW.compression IS DISTINCT FROM OLD.compression
      OR NEW.expected_source_sha256 IS DISTINCT FROM OLD.expected_source_sha256
      OR NEW.expected_compressed_sha256 IS DISTINCT FROM OLD.expected_compressed_sha256
      OR NEW.expected_row_count IS DISTINCT FROM OLD.expected_row_count
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'catalog source import payload identity is immutable';
    END IF;

    IF OLD.status = 'staging' THEN
      IF NEW.status NOT IN ('staging','ready','rejected') THEN
        RAISE EXCEPTION 'invalid catalogue import transition: % -> %', OLD.status, NEW.status;
      END IF;
      IF NEW.status = 'staging' AND OLD.payload IS NOT NULL
        AND (NEW.payload IS NULL OR octet_length(NEW.payload) < octet_length(OLD.payload)
          OR substring(NEW.payload from 1 for octet_length(OLD.payload)) <> OLD.payload) THEN
        RAISE EXCEPTION 'staging payload bytes are append-only';
      END IF;
    ELSIF OLD.status = 'ready' THEN
      IF NEW.status NOT IN ('imported','rejected') THEN
        RAISE EXCEPTION 'invalid catalogue import transition: % -> %', OLD.status, NEW.status;
      END IF;
      IF NEW.status = 'imported' AND (NEW.imported_snapshot_id IS NULL OR NEW.imported_at IS NULL OR NEW.payload IS NOT NULL) THEN
        RAISE EXCEPTION 'successful catalogue import must bind snapshot, imported_at and clear payload bytes';
      END IF;
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_source_import_payload_guard ON catalog_source_import_payloads;
CREATE TRIGGER catalog_source_import_payload_guard
  BEFORE UPDATE OR DELETE ON catalog_source_import_payloads
  FOR EACH ROW EXECUTE FUNCTION bls_private.guard_catalog_source_import_payload_mutation();

CREATE OR REPLACE FUNCTION bls_private.seal_catalog_source_import_payload(p_payload_id uuid)
RETURNS TABLE(payload_id uuid, compressed_size bigint, compressed_sha256 text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,extensions,bls_private
AS $$
DECLARE
  v_payload catalog_source_import_payloads%ROWTYPE;
  v_hash text;
  v_size bigint;
BEGIN
  SELECT * INTO v_payload
  FROM catalog_source_import_payloads
  WHERE id=p_payload_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog source import payload not found';
  END IF;
  IF v_payload.status <> 'staging' THEN
    RAISE EXCEPTION 'catalog source import payload is not staging';
  END IF;
  IF v_payload.payload IS NULL OR octet_length(v_payload.payload)=0 THEN
    RAISE EXCEPTION 'catalog source import payload is empty';
  END IF;

  v_size := octet_length(v_payload.payload);
  v_hash := encode(extensions.digest(v_payload.payload,'sha256'),'hex');
  IF v_hash <> v_payload.expected_compressed_sha256 THEN
    RAISE EXCEPTION 'compressed payload checksum mismatch';
  END IF;

  UPDATE catalog_source_import_payloads
  SET status='ready', compressed_size=v_size, sealed_at=now(), updated_at=now()
  WHERE id=p_payload_id;

  RETURN QUERY SELECT p_payload_id, v_size, v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.complete_catalog_source_import_payload(
  p_payload_id uuid,
  p_snapshot_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  UPDATE catalog_source_import_payloads
  SET status='imported', imported_snapshot_id=p_snapshot_id, imported_at=now(), payload=NULL, failure_reason=NULL, updated_at=now()
  WHERE id=p_payload_id AND status='ready';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog source import payload is not ready';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.reject_catalog_source_import_payload(
  p_payload_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  UPDATE catalog_source_import_payloads
  SET status='rejected', failure_reason=left(COALESCE(NULLIF(btrim(p_reason),''),'rejected'),2000), payload=NULL, updated_at=now()
  WHERE id=p_payload_id AND status IN ('staging','ready');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog source import payload is not mutable';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION bls_private.guard_catalog_source_import_payload_mutation() TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.seal_catalog_source_import_payload(uuid) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.complete_catalog_source_import_payload(uuid,uuid) TO bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.reject_catalog_source_import_payload(uuid,text) TO bls_platform_runtime;

COMMIT;

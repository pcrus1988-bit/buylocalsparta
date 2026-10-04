-- NYXI Phase 0 evidence retention hardening.
-- Once raw evidence has been captured, registry cleanup must not erase its
-- provenance. Snapshot and check ledgers are append-only to runtime roles.

BEGIN;

ALTER TABLE public.nyxi_source_snapshots
  DROP CONSTRAINT nyxi_source_snapshots_source_id_fkey,
  ADD CONSTRAINT nyxi_source_snapshots_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT;

ALTER TABLE public.nyxi_source_candidate_snapshots
  DROP CONSTRAINT nyxi_source_candidate_snapshots_candidate_id_fkey,
  ADD CONSTRAINT nyxi_source_candidate_snapshots_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES public.nyxi_source_candidates(id) ON DELETE RESTRICT;

ALTER TABLE public.nyxi_source_candidate_checks
  DROP CONSTRAINT nyxi_source_candidate_checks_candidate_id_fkey,
  ADD CONSTRAINT nyxi_source_candidate_checks_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES public.nyxi_source_candidates(id) ON DELETE RESTRICT;

REVOKE UPDATE, DELETE ON TABLE public.nyxi_source_snapshots
  FROM bls_app_runtime, bls_platform_runtime;

REVOKE DELETE ON TABLE public.nyxi_sources
  FROM bls_app_runtime, bls_platform_runtime;

REVOKE DELETE ON TABLE public.nyxi_source_candidates
  FROM bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.nyxi_source_snapshots IS
  'Append-only versioned capture metadata for verified NYXI sources. Raw bodies/files are content-addressed in private object storage; source deletion is blocked once snapshot evidence exists.';

COMMENT ON TABLE public.nyxi_source_candidate_snapshots IS
  'Append-only immutable raw captures of unverified NYXI candidates. Candidate deletion is blocked once snapshot evidence exists. Capture never implies source verification or authority.';

COMMENT ON TABLE public.nyxi_source_candidate_checks IS
  'Append-only transport history for unverified candidate acquisition. Candidate deletion is blocked once check evidence exists.';

COMMIT;

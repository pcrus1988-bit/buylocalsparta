-- NYXI Intelligence: exact-asset, independent-human publication gate (2026-10-14).
-- Deny by default: adds no reviewers, approvals, rights, entities, public docs or grants.
-- Apply only through the project migration workflow; roll back by restoring prior views
-- if the acceptance query unexpectedly changes previously permitted internal evidence.
--
-- Existing approval rows: zero at time of authoring. Keep the existing primary key,
-- audit and revocation columns; require new separate authorization details to publish.
ALTER TABLE public.nyxi_fragment_publication_approvals
  ADD COLUMN IF NOT EXISTS snapshot_sha256 text,
  ADD COLUMN IF NOT EXISTS fragment_sha256 text,
  ADD COLUMN IF NOT EXISTS approved_content_sha256 text,
  ADD COLUMN IF NOT EXISTS reviewer_user_id uuid,
  ADD COLUMN IF NOT EXISTS rights_reviewer_user_id uuid,
  ADD COLUMN IF NOT EXISTS rights_evidence_sha256 text,
  ADD COLUMN IF NOT EXISTS rights_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_excerpt_authorized boolean NOT NULL DEFAULT false;

-- Existing rows cannot accidentally turn into approvals: defaults are not authorization.
CREATE UNIQUE INDEX IF NOT EXISTS nyxi_one_live_publication_approval_v2
  ON public.nyxi_fragment_publication_approvals (fragment_id)
  WHERE revoked_at IS NULL;

-- Keep precisely the previous view column names and ordering for dependent views.
-- The full acquisition provenance must bind the exact immutable snapshot to its
-- manifest and permission, including canonical/final URL and explicit Drive rights.
CREATE OR REPLACE VIEW public.nyxi_valid_snapshots_v1
WITH (security_invoker = true, security_barrier = true)
AS
SELECT s.id AS snapshot_id,
       s.source_id,
       src.source_key,
       s.final_url,
       s.fetched_at,
       s.sha256,
       s.byte_length,
       s.storage_bucket,
       s.storage_path,
       m.id AS manifest_id,
       m.extraction_status,
       a.id AS approval_id,
       s.id = (
         SELECT x.id
         FROM public.nyxi_source_snapshots x
         WHERE x.source_id = s.source_id
         ORDER BY x.fetched_at DESC, x.id DESC
         LIMIT 1
       ) AS latest_snapshot
FROM public.nyxi_source_snapshots s
JOIN public.nyxi_sources src ON src.id=s.source_id
JOIN public.nyxi_corpus_manifest m
  ON m.snapshot_id=s.id AND m.source_id=s.source_id
JOIN public.nyxi_asset_acquisition_approvals a
  ON a.id::text=s.provenance->>'asset_approval_id'
 AND a.id::text=m.metadata->>'asset_approval_id'
 AND a.source_id=s.source_id
WHERE a.acquisition_authorized IS TRUE
  AND a.expires_at > now()
  AND a.review_due_at > now()
  AND (a.retention_until IS NULL OR a.retention_until > now())
  AND a.approved_at <= s.fetched_at
  AND a.expires_at > s.fetched_at
  AND a.approved_final_url IS NOT NULL
  AND s.final_url=a.asset_url
  AND s.final_url=a.approved_final_url
  AND s.http_status=200
  AND s.storage_bucket='nyxi-evidence'
  AND s.sha256 ~ '^[0-9a-f]{64}$'
  AND s.byte_length>0
  AND s.provenance->>'original_bytes_preserved'='true'
  AND m.corpus_state='archived'
  AND (
    m.mirrored_to_drive IS NOT TRUE
    OR (a.mirror_authorized IS TRUE
      AND m.drive_file_id IS NOT NULL
      AND length(trim(m.drive_file_id)) >= 8)
  );

-- Reviewed-only is now also current-snapshot-only, exact-hash bound and
-- two-person reviewed; no pre-existing approval row can bypass the new contract.
-- The publication actor must be an active publisher, the rights reviewer
-- an independently enrolled active reviewer/publisher, and they must differ.
CREATE OR REPLACE VIEW public.nyxi_reviewed_fragments_v1
WITH (security_invoker = true, security_barrier = true)
AS
SELECT f.id,
       f.source_id,
       f.snapshot_id,
       f.fragment_key,
       f.ordinal,
       f.section_heading,
       f.section_path,
       f.html_anchor,
       f.element_tag,
       f.body_text,
       f.content_sha256,
       f.extraction_method,
       f.evidence_class,
       f.metadata,
       f.created_at
FROM public.nyxi_evidence_fragments f
JOIN public.nyxi_fragment_publication_approvals a
  ON a.fragment_id=f.id
 AND a.source_id=f.source_id
 AND a.snapshot_id=f.snapshot_id
 AND a.revoked_at IS NULL
JOIN public.nyxi_valid_snapshots_v1 v
  ON v.snapshot_id=f.snapshot_id
 AND v.source_id=f.source_id
 AND v.latest_snapshot IS TRUE
JOIN public.nyxi_reviewers publisher
  ON publisher.user_id=a.reviewer_user_id
 AND publisher.role='publisher'
 AND publisher.disabled_at IS NULL
JOIN public.nyxi_reviewers rights_reviewer
  ON rights_reviewer.user_id=a.rights_reviewer_user_id
 AND rights_reviewer.role IN ('reviewer','publisher')
 AND rights_reviewer.disabled_at IS NULL
WHERE f.metadata->>'review_status'='approved'
  AND COALESCE(f.metadata->>'review_required','true') <> 'true'
  AND a.public_excerpt_authorized IS TRUE
  AND a.reviewer_user_id <> a.rights_reviewer_user_id
  AND a.approved_by=a.reviewer_user_id::text
  AND a.snapshot_sha256=v.sha256
  AND a.fragment_sha256=f.content_sha256
  AND a.approved_content_sha256=f.content_sha256
  AND a.rights_evidence_sha256 ~ '^[0-9a-f]{64}$'
  AND a.rights_reviewed_at IS NOT NULL
  AND a.rights_reviewed_at <= a.approved_at
  AND EXISTS (
    SELECT 1 FROM public.nyxi_extraction_runs run
    WHERE run.snapshot_id=f.snapshot_id
      AND run.source_id=f.source_id
      AND run.status='complete'
  );

COMMENT ON VIEW public.nyxi_valid_snapshots_v1 IS
  'Exact permission, approved final URL, manifest identity, mirror rights and immutable source snapshot chain; current snapshot flag calculated separately.';
COMMENT ON VIEW public.nyxi_reviewed_fragments_v1 IS
  'Deny-by-default publication: current valid immutable snapshot, exact fragment hash, explicit independently evidenced public excerpt rights, active separate human reviewer and publisher.';

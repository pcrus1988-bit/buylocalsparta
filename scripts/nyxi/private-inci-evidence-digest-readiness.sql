-- NYXI Agent 3: read-only, aggregate-only evidence metadata integrity audit.
-- SHA-256 shape is NOT a verification of original archived bytes or chemical identity.
-- No fragment text, private identifiers, or URLs are returned.
WITH lineage AS (
  SELECT i.id,
    (s.id IS NOT NULL AND f.id IS NOT NULL) AS evidence_exists,
    (i.source_id = s.source_id AND i.source_id = f.source_id
      AND i.snapshot_id = f.snapshot_id) IS TRUE AS lineage_matches,
    (s.sha256 ~ '^[0-9a-fA-F]{64}$') IS TRUE AS snapshot_digest_shape_ok,
    (f.content_sha256 ~ '^[0-9a-fA-F]{64}$') IS TRUE AS fragment_digest_shape_ok,
    (s.storage_bucket = 'nyxi-evidence'
      AND nullif(btrim(s.storage_path), '') IS NOT NULL) IS TRUE AS private_storage_metadata_ok,
    (s.http_status = 200) IS TRUE AS capture_http_ok,
    (nullif(btrim(i.source_document_reference), '') IS NOT NULL) AS source_reference_ok,
    i.review_status
  FROM public.nyxi_ingredient_identity_assertions_v1 i
  LEFT JOIN public.nyxi_source_snapshots s ON s.id = i.snapshot_id
  LEFT JOIN public.nyxi_evidence_fragments f ON f.id = i.fragment_id
)
SELECT count(*) AS assertions_checked,
  count(*) FILTER (WHERE NOT evidence_exists) AS missing_evidence,
  count(*) FILTER (WHERE NOT lineage_matches) AS mismatched_ancestry,
  count(*) FILTER (WHERE NOT snapshot_digest_shape_ok) AS malformed_snapshot_digest,
  count(*) FILTER (WHERE NOT fragment_digest_shape_ok) AS malformed_fragment_digest,
  count(*) FILTER (WHERE NOT private_storage_metadata_ok) AS private_storage_metadata_failure,
  count(*) FILTER (WHERE NOT capture_http_ok) AS non_200_capture,
  count(*) FILTER (WHERE NOT source_reference_ok) AS missing_source_reference,
  count(*) FILTER (WHERE evidence_exists AND lineage_matches
    AND snapshot_digest_shape_ok AND fragment_digest_shape_ok
    AND private_storage_metadata_ok AND capture_http_ok AND source_reference_ok)
    AS metadata_only_review_candidates,
  count(*) FILTER (WHERE review_status = 'pending') AS pending_independent_review,
  false AS archived_bytes_verified,
  false AS chemical_identity_verified,
  false AS publication_authorized
FROM lineage;

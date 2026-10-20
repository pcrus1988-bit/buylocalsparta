-- NYXI Agent 1 | #1460 / #1444 | 2026-10-13
-- READ ONLY. No rights grants, private evidence or migration changes.
-- Tests current rows AND future-facing view contract (these are different).
WITH chain AS (
 SELECT sn.id, sn.source_id, sn.final_url, sn.fetched_at, sn.sha256,
 sn.byte_length, sn.http_status, sn.storage_bucket, sn.provenance,
 m.id manifest_id, m.source_id manifest_source, m.corpus_state,
 m.mirrored_to_drive, m.drive_file_id, m.metadata manifest_metadata,
 a.id approval_id, a.source_id approval_source, a.asset_url,
 a.approved_final_url, a.acquisition_authorized, a.mirror_authorized,
 a.approved_at, a.expires_at, a.review_due_at, a.retention_until
 FROM public.nyxi_source_snapshots sn
 LEFT JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id
 LEFT JOIN public.nyxi_asset_acquisition_approvals a
 ON a.id::text=sn.provenance->>'asset_approval_id'
), strict AS (
 SELECT id FROM chain WHERE manifest_id IS NOT NULL AND approval_id IS NOT NULL
 AND source_id=manifest_source AND source_id=approval_source
 AND provenance->>'asset_approval_id'=manifest_metadata->>'asset_approval_id'
 AND final_url=asset_url AND final_url=approved_final_url
 AND acquisition_authorized IS TRUE AND mirror_authorized IS FALSE
 AND mirrored_to_drive IS FALSE AND drive_file_id IS NULL
 AND approved_at<=fetched_at AND expires_at>fetched_at
 AND expires_at>now() AND review_due_at>now()
 AND (retention_until IS NULL OR retention_until>now())
 AND http_status=200 AND storage_bucket='nyxi-evidence'
 AND sha256 ~ '^[0-9a-f]{64}$' AND byte_length>0
 AND provenance->>'original_bytes_preserved'='true'
 AND corpus_state='archived'
), fixture(label,source_ok,approval_ok,final_url_ok,mirror_ok,drive_id_ok) AS (
 VALUES
 ('valid',true,true,true,true,true),
 ('wrong_source',false,true,true,true,true),
 ('manifest_approval_swapped',true,false,true,true,true),
 ('redirect_changed_final_url',true,true,false,true,true),
 ('unauthorized_drive_mirror',true,true,true,false,true),
 ('unexpected_drive_file_id',true,true,true,true,false)
), fixture_result AS (
 SELECT label,source_ok AND approval_ok AND final_url_ok AND mirror_ok AND drive_id_ok accepted FROM fixture
), contract AS (
 SELECT pg_get_viewdef('public.nyxi_valid_snapshots_v1'::regclass,true) ddl
)
SELECT 'strict_live_chain' test,
 CASE WHEN (SELECT count(*) FROM chain)=(SELECT count(*) FROM strict) THEN 'pass' ELSE 'fail' END status,
 (SELECT count(*) FROM strict)::text||'/'||(SELECT count(*) FROM chain)::text detail
UNION ALL SELECT 'view_overinclusive',
 CASE WHEN NOT EXISTS(SELECT snapshot_id FROM public.nyxi_valid_snapshots_v1 EXCEPT SELECT id FROM strict) THEN 'pass' ELSE 'fail' END,
 (SELECT count(*) FROM (SELECT snapshot_id FROM public.nyxi_valid_snapshots_v1 EXCEPT SELECT id FROM strict) v)::text
UNION ALL SELECT 'synthetic_negative_cases',
 CASE WHEN (SELECT bool_and(NOT accepted) FROM fixture_result WHERE label<>'valid') THEN 'pass' ELSE 'fail' END,
 (SELECT count(*) FROM fixture_result WHERE label<>'valid' AND NOT accepted)::text||'/5'
UNION ALL SELECT 'synthetic_positive_case',
 CASE WHEN (SELECT bool_and(accepted) FROM fixture_result WHERE label='valid') THEN 'pass' ELSE 'fail' END,'1/1'
UNION ALL SELECT 'view_contract_final_url',
 CASE WHEN (SELECT position('approved_final_url' IN ddl)>0 FROM contract) THEN 'pass' ELSE 'gap' END,
 'approved_final_url must match snapshot final_url'
UNION ALL SELECT 'view_contract_manifest_approval',
 CASE WHEN (SELECT (position('m.metadata' IN ddl)>0 OR position('manifest_metadata' IN ddl)>0) FROM contract) THEN 'pass' ELSE 'gap' END,
 'manifest approval ID must match provenance approval ID'
UNION ALL SELECT 'view_contract_mirror',
 CASE WHEN (SELECT (position('mirrored_to_drive' IN ddl)>0 AND position('drive_file_id' IN ddl)>0) FROM contract) THEN 'pass' ELSE 'gap' END,
 'no unauthorized Drive mirroring'
ORDER BY test;
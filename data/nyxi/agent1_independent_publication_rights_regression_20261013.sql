-- NYXI Agent 1 | #1460 / #1444 | 2026-10-13
-- READ ONLY. No rights grants, schema writes, Storage access or publication.
-- Acquisition permission != publication rights. Metadata flags alone are not
-- independently authenticated human approvals. Hashes are recorded, not byte-rehashed.
WITH required_columns(name) AS (
 VALUES ('snapshot_sha256'),('fragment_sha256'),('reviewer_user_id'),
        ('public_excerpt_authorized'),('rights_evidence_sha256')
), schema_gate AS (
 SELECT count(*) FILTER (WHERE c.column_name IS NULL) missing_count,
        array_agg(r.name ORDER BY r.name) FILTER (WHERE c.column_name IS NULL) missing_names
 FROM required_columns r
 LEFT JOIN information_schema.columns c ON c.table_schema='public'
   AND c.table_name='nyxi_fragment_publication_approvals'
   AND c.column_name=r.name
), acquisition AS (
 SELECT a.*,
   (a.metadata->>'rights_evidence_sha256') ~ '^[0-9a-f]{64}$' AS evidence_hash_valid,
   a.metadata->>'public_excerpt_authorized'='true' AS excerpt_flag,
   a.metadata->>'independent_human_reviewed'='true' AS independent_flag
 FROM public.nyxi_asset_acquisition_approvals a
), fixture(name,independent_human,rights_evidence,snapshot_hash_match,
           fragment_hash_match,excerpt_right,not_revoked,expected) AS (
 VALUES
 ('all_requirements',true,true,true,true,true,true,true),
 ('self_review',false,true,true,true,true,true,false),
 ('no_documentary_rights',true,false,true,true,true,true,false),
 ('wrong_snapshot_hash',true,true,false,true,true,true,false),
 ('wrong_fragment_hash',true,true,true,false,true,true,false),
 ('acquisition_only',true,true,true,true,false,true,false),
 ('revoked',true,true,true,true,true,false,false)
), fixtures AS (
 SELECT count(*) total,
        count(*) FILTER (WHERE (independent_human AND rights_evidence AND
          snapshot_hash_match AND fragment_hash_match AND excerpt_right AND not_revoked)
          IS NOT DISTINCT FROM expected) passed
 FROM fixture
)
SELECT 'sources' metric, count(*)::text result FROM public.nyxi_sources
UNION ALL SELECT 'snapshots', count(*)::text FROM public.nyxi_source_snapshots
UNION ALL SELECT 'private_fragments', count(*)::text FROM public.nyxi_evidence_fragments
UNION ALL SELECT 'acquisition_authorized', count(*)::text FROM acquisition WHERE acquisition_authorized IS TRUE
UNION ALL SELECT 'mirror_authorized', count(*)::text FROM acquisition WHERE mirror_authorized IS TRUE
UNION ALL SELECT 'agent_attributed_acquisition', count(*)::text FROM acquisition WHERE approved_by ILIKE '%Agent%'
UNION ALL SELECT 'acquisition_without_evidence_hash', count(*)::text FROM acquisition WHERE evidence_hash_valid IS DISTINCT FROM TRUE
UNION ALL SELECT 'acquisition_without_retention_deadline', count(*)::text FROM acquisition WHERE retention_until IS NULL
UNION ALL SELECT 'metadata_excerpt_flags_unverified', count(*)::text FROM acquisition WHERE excerpt_flag IS TRUE
UNION ALL SELECT 'metadata_independent_flags_unverified', count(*)::text FROM acquisition WHERE independent_flag IS TRUE
UNION ALL SELECT 'missing_review_contract_columns', missing_count::text FROM schema_gate
UNION ALL SELECT 'missing_review_contract_names', coalesce(array_to_string(missing_names,','),'') FROM schema_gate
UNION ALL SELECT 'current_fragment_publication_approvals', count(*)::text FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL
UNION ALL SELECT 'reviewed_fragments', count(*)::text FROM public.nyxi_reviewed_fragments_v1
UNION ALL SELECT 'search_documents', count(*)::text FROM public.nyxi_search_documents_v1
UNION ALL SELECT 'synthetic_gate_tests', passed::text||'/'||total::text FROM fixtures
ORDER BY metric;

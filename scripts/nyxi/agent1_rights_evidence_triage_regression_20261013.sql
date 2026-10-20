-- NYXI Agent 1 | read-only source rights triage | 2026-10-13 | #1460 #1444
-- No private body text, rights grant, review decision, DDL or publication.
-- approved_by text does not authenticate an independent human reviewer.
WITH per_source AS (
 SELECT s.id, s.source_role,
 count(a.id) FILTER (WHERE a.acquisition_authorized IS TRUE)::integer authorized_assets,
 coalesce(bool_and(a.asset_url=s.canonical_url AND a.approved_final_url=a.asset_url)
   FILTER (WHERE a.acquisition_authorized IS TRUE),false) exact_scope_ok,
 coalesce(bool_and(a.mirror_authorized IS FALSE)
   FILTER (WHERE a.acquisition_authorized IS TRUE),false) no_mirror_ok,
 coalesce(bool_and(coalesce(a.metadata->>'rights_evidence_sha256','') ~ '^[0-9a-f]{64}$')
   FILTER (WHERE a.acquisition_authorized IS TRUE),false) documentary_hash_recorded,
 coalesce(bool_and(a.retention_until IS NOT NULL AND a.retention_until>now())
   FILTER (WHERE a.acquisition_authorized IS TRUE),false) retention_deadline_recorded,
 false independently_authenticated_human
 FROM public.nyxi_sources s
 LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.source_id=s.id
 GROUP BY s.id,s.source_role
), subjects AS (
 SELECT id::text key,false synthetic,null::text expected,authorized_assets,exact_scope_ok,
 no_mirror_ok,documentary_hash_recorded,retention_deadline_recorded,
 independently_authenticated_human FROM per_source
 UNION ALL
 SELECT 'fixture_'||v.label,true,v.expected,v.n,v.exact_scope,v.no_mirror,
 v.doc_hash,v.retention,v.independent_human
 FROM (VALUES
 ('unapproved',0,true,true,true,true,true,'NO_AUTHORIZED_ASSET'),
 ('multiple',2,true,true,true,true,true,'MULTIPLE_AUTHORIZED_ASSETS'),
 ('wrong_url',1,false,true,true,true,true,'EXACT_SCOPE_INVALID'),
 ('mirror',1,true,false,true,true,true,'MIRROR_NOT_AUTHORIZED'),
 ('no_document',1,true,true,false,true,true,'HUMAN_RIGHTS_EVIDENCE_REQUIRED'),
 ('no_retention',1,true,true,true,false,true,'HUMAN_RIGHTS_EVIDENCE_REQUIRED'),
 ('agent_attested',1,true,true,true,true,false,'HUMAN_RIGHTS_EVIDENCE_REQUIRED'),
 ('acquisition_only',1,true,true,true,true,true,'ACQUISITION_ONLY_PUBLICATION_PENDING')
 ) v(label,n,exact_scope,no_mirror,doc_hash,retention,independent_human,expected)
), classified AS (
 SELECT *,CASE
 WHEN authorized_assets=0 THEN 'NO_AUTHORIZED_ASSET'
 WHEN authorized_assets>1 THEN 'MULTIPLE_AUTHORIZED_ASSETS'
 WHEN NOT exact_scope_ok THEN 'EXACT_SCOPE_INVALID'
 WHEN NOT no_mirror_ok THEN 'MIRROR_NOT_AUTHORIZED'
 WHEN NOT documentary_hash_recorded OR NOT retention_deadline_recorded
 OR NOT independently_authenticated_human THEN 'HUMAN_RIGHTS_EVIDENCE_REQUIRED'
 ELSE 'ACQUISITION_ONLY_PUBLICATION_PENDING' END decision
 FROM subjects
), audit AS (
 SELECT 'source_count' metric,count(*)::text result FROM per_source
 UNION ALL SELECT 'no_authorized_asset',count(*) FILTER(WHERE authorized_assets=0)::text FROM per_source
 UNION ALL SELECT 'authorized_asset_sources',count(*) FILTER(WHERE authorized_assets>0)::text FROM per_source
 UNION ALL SELECT 'missing_documentary_hash_on_authorized',count(*) FILTER(WHERE authorized_assets>0 AND NOT documentary_hash_recorded)::text FROM per_source
 UNION ALL SELECT 'missing_retention_on_authorized',count(*) FILTER(WHERE authorized_assets>0 AND NOT retention_deadline_recorded)::text FROM per_source
 UNION ALL SELECT 'human_review_required',count(*) FILTER(WHERE decision='HUMAN_RIGHTS_EVIDENCE_REQUIRED')::text FROM classified WHERE NOT synthetic
 UNION ALL SELECT 'snapshot_count',count(*)::text FROM public.nyxi_source_snapshots
 UNION ALL SELECT 'private_fragment_count',count(*)::text FROM public.nyxi_evidence_fragments
 UNION ALL SELECT 'fragment_sha256_verified',count(*) FILTER(WHERE encode(digest(body_text,'sha256'),'hex')=content_sha256)::text FROM public.nyxi_evidence_fragments
 UNION ALL SELECT 'fragment_missing_citation_location',count(*) FILTER(WHERE nullif(html_anchor,'') IS NULL OR coalesce(cardinality(section_path),0)=0)::text FROM public.nyxi_evidence_fragments
 UNION ALL SELECT 'current_publication_approvals',count(*)::text FROM public.nyxi_fragment_publication_approvals WHERE revoked_at IS NULL
 UNION ALL SELECT 'current_search_records',count(*)::text FROM public.nyxi_search_documents_v1
 UNION ALL SELECT 'duplicate_source_url_groups',count(*)::text FROM (SELECT lower(btrim(canonical_url)) FROM public.nyxi_sources GROUP BY 1 HAVING count(*)>1) d
 UNION ALL SELECT 'duplicate_source_snapshot_hash_groups',count(*)::text FROM (SELECT source_id,sha256 FROM public.nyxi_source_snapshots GROUP BY 1,2 HAVING count(*)>1) d
 UNION ALL SELECT 'synthetic_cases_passed',count(*) FILTER(WHERE decision=expected)::text||'/8' FROM classified WHERE synthetic
 UNION ALL SELECT 'synthetic_cases_failed',coalesce(string_agg(key,',' ORDER BY key) FILTER(WHERE decision IS DISTINCT FROM expected),'none') FROM classified WHERE synthetic
)
SELECT metric,result FROM audit ORDER BY metric;

-- NYXI controlled exact-mention backfill for the three already-archived SCCS PDFs.
-- Re-running is safe. Candidates are NOT accepted product composition, legal
-- determinations, safety conclusions, or public facts.
WITH refs(entity_type,canonical_key,label,aliases,properties) AS (
 VALUES
 ('ingredient','ingredient:2-hydroxyethyl-methacrylate','2-Hydroxyethyl methacrylate (HEMA)',
 ARRAY['HEMA','2-hydroxyethyl methacrylate','CAS 868-77-9']::text[],
 jsonb_build_object('cas_candidates',jsonb_build_array('868-77-9'),'lifecycle','candidate','visibility','private','review_required',true,'identity_review_required',true,'parser','nyxi-sccs-exact-mentions-v1','interpretation','no product presence, concentration, safety, or current legal-status assertion')),
 ('ingredient','ingredient:di-hema-trimethylhexyl-dicarbamate','Di-HEMA Trimethylhexyl Dicarbamate',
 ARRAY['Di-HEMA Trimethylhexyl Dicarbamate','Di-HEMA TMHDC','CAS 41137-60-4','CAS 72869-86-4']::text[],
 jsonb_build_object('cas_candidates',jsonb_build_array('41137-60-4','72869-86-4'),'lifecycle','candidate','visibility','private','review_required',true,'identity_review_required',true,'parser','nyxi-sccs-exact-mentions-v1','interpretation','no product presence, concentration, safety, or current legal-status assertion')),
 ('ingredient','ingredient:trimethylbenzoyl-diphenylphosphine-oxide','Trimethylbenzoyl diphenylphosphine oxide (TPO)',
 ARRAY['TPO','Trimethylbenzoyl diphenylphosphine oxide','CAS 75980-60-8']::text[],
 jsonb_build_object('cas_candidates',jsonb_build_array('75980-60-8'),'lifecycle','candidate','visibility','private','review_required',true,'identity_review_required',true,'parser','nyxi-sccs-exact-mentions-v1','interpretation','2014 opinion is historical and does not establish 2026 legal status'))
)
INSERT INTO public.nyxi_entities(entity_type,canonical_key,label,aliases,properties)
SELECT * FROM refs
ON CONFLICT(canonical_key) DO NOTHING;

WITH patterns(canonical_key,pat,source_key) AS (
 VALUES
 ('ingredient:2-hydroxyethyl-methacrylate','(^|[^[:alnum:]-])HEMA([^[:alnum:]_-]|$)|\m2-hydroxyethyl methacrylate\M','eu_sccs_hema_di_hema_2018_pdf'),
 ('ingredient:di-hema-trimethylhexyl-dicarbamate','\mdi[ -]HEMA\M|\mdi[ -]HEMA[[:space:]-]+trimethylhexyl\M','eu_sccs_hema_di_hema_2018_pdf'),
 ('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','\mTPO\M|\mtrimethylbenzoyl[[:space:]-]*diphenylphosphine[[:space:]-]*oxide\M','eu_sccs_tpo_2014_pdf'),
 ('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','\mTPO\M|\mtrimethylbenzoyl[[:space:]-]*diphenylphosphine[[:space:]-]*oxide\M','eu_sccs_notes_guidance_12_pdf')
), qualifying AS (
 SELECT DISTINCT e.id AS entity_id,f.id AS fragment_id,
 f.content_sha256,sn.sha256 AS snapshot_sha256,s.source_key,
 f.metadata->>'page_number' AS page_number
 FROM patterns p
 JOIN public.nyxi_entities e ON e.canonical_key=p.canonical_key
 JOIN public.nyxi_sources s ON s.source_key=p.source_key
 JOIN public.nyxi_evidence_fragments f ON f.source_id=s.id
  AND f.extraction_method='nyxi-pdf-text-v1' AND f.body_text ~* p.pat
 JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id
 JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id
  AND m.extraction_status='complete' AND m.metadata->>'sha256'=sn.sha256
 JOIN public.nyxi_extraction_runs r ON r.snapshot_id=sn.id
  AND r.parser_version='nyxi-pdf-text-v1' AND r.status='complete'
 WHERE f.metadata->>'review_status'='pending'
)
INSERT INTO public.nyxi_entity_evidence(entity_id,fragment_id,evidence_role,confidence,metadata)
SELECT q.entity_id,q.fragment_id,'candidate_mention',0.650,
 jsonb_build_object('extractor','nyxi-sccs-exact-mentions-v1','review_status','pending',
 'fragment_sha256',q.content_sha256,'snapshot_sha256',q.snapshot_sha256,
 'page_number',q.page_number,'source_key',q.source_key,
 'evidence_semantics','text_mention_only_not_product_content_or_safety_claim',
 'not_for_publication',true,'needs_independent_review',true)
FROM qualifying q
ON CONFLICT(entity_id,fragment_id,evidence_role) DO NOTHING;

-- Separate page-header frequency from text-body references. This is triage,
-- NOT automated promotion/rejection or scientific verification.
WITH flagged AS (
 SELECT ee.id,f.body_text,
 CASE WHEN e.canonical_key='ingredient:2-hydroxyethyl-methacrylate'
 THEN '(^|[^[:alnum:]-])HEMA([^[:alnum:]_-]|$)|\m2-hydroxyethyl methacrylate\M'
 WHEN e.canonical_key='ingredient:di-hema-trimethylhexyl-dicarbamate'
 THEN '\mdi[ -]HEMA\M'
 ELSE '\mTPO\M|\mtrimethylbenzoyl[[:space:]-]*diphenylphosphine[[:space:]-]*oxide\M'
 END AS pat
 FROM public.nyxi_entity_evidence ee
 JOIN public.nyxi_entities e ON e.id=ee.entity_id
 JOIN public.nyxi_evidence_fragments f ON f.id=ee.fragment_id
 WHERE ee.metadata->>'extractor'='nyxi-sccs-exact-mentions-v1'
), labels AS (
 SELECT id,CASE
 WHEN substring(body_text from 241) ~* pat THEN 'body_context_present'
 WHEN substring(body_text from 1 for 240) ~* pat THEN 'header_only_possible'
 ELSE 'needs_pattern_review' END AS lane FROM flagged
)
UPDATE public.nyxi_entity_evidence ee
SET metadata=ee.metadata||jsonb_build_object('qa_lane',l.lane,
 'qa_method','first_240_vs_later_text_v1','qa_review_required',true)
FROM labels l WHERE ee.id=l.id
 AND ee.metadata->>'qa_lane' IS DISTINCT FROM l.lane;

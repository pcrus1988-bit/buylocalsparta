-- Private SCCS ingredient evidence review surfaces. Applied to production as
-- nyxi_private_ingredient_mentions_qa_v1 on 2026-10-18.
-- No public search, Drive mirror or publication rights are granted.
CREATE OR REPLACE VIEW public.nyxi_private_ingredient_review_queue_v1
WITH (security_invoker = true)
AS
SELECT
 ee.id AS mention_id, e.id AS entity_id, e.label AS ingredient_candidate,
 e.canonical_key, e.properties->'cas_candidates' AS cas_candidates,
 ee.evidence_role, ee.confidence, ee.metadata->>'qa_lane' AS qa_lane,
 ee.metadata->>'review_status' AS mention_review_status,
 f.id AS fragment_id, f.snapshot_id, s.source_key,
 s.title AS source_title, s.authority, s.jurisdiction,
 s.canonical_url AS source_url,
 f.metadata->>'page_number' AS page_number, f.section_heading,
 f.content_sha256 AS fragment_sha256, sn.sha256 AS source_sha256,
 left(f.body_text,700) AS private_excerpt, sn.fetched_at,
 m.extraction_status, false AS independently_approved
FROM public.nyxi_entity_evidence ee
JOIN public.nyxi_entities e ON e.id=ee.entity_id
JOIN public.nyxi_evidence_fragments f ON f.id=ee.fragment_id
JOIN public.nyxi_sources s ON s.id=f.source_id
JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id
JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=f.snapshot_id
WHERE ee.metadata->>'extractor'='nyxi-sccs-exact-mentions-v1'
 AND e.properties->>'visibility'='private'
 AND ee.metadata->>'not_for_publication'='true'
 AND m.extraction_status='complete'
 AND sn.sha256=m.metadata->>'sha256';
REVOKE ALL ON public.nyxi_private_ingredient_review_queue_v1
FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_ingredient_review_queue_v1 TO service_role;

CREATE OR REPLACE VIEW public.nyxi_private_ingredient_summary_v1
WITH (security_invoker = true)
AS
SELECT entity_id,ingredient_candidate,canonical_key,cas_candidates,
 count(*)::integer AS mention_fragments,
 count(DISTINCT source_key)::integer AS source_documents,
 count(DISTINCT(source_key||':'||COALESCE(page_number,'unknown')))::integer AS source_pages,
 count(*) FILTER(WHERE qa_lane='body_context_present')::integer AS body_context_fragments,
 count(*) FILTER(WHERE qa_lane='header_only_possible')::integer AS header_only_possible,
 count(*) FILTER(WHERE qa_lane='needs_pattern_review')::integer AS pattern_review,
 'PENDING_PRIVATE_REVIEW'::text AS review_state
FROM public.nyxi_private_ingredient_review_queue_v1
GROUP BY entity_id,ingredient_candidate,canonical_key,cas_candidates;
REVOKE ALL ON public.nyxi_private_ingredient_summary_v1
FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_ingredient_summary_v1 TO service_role;

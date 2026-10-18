-- Applied to production 2026-10-18 as private regulatory classification matrix.
-- These states are only proposed interpretations pending independent review.
CREATE OR REPLACE VIEW public.nyxi_private_nail_regulatory_matrix_v1 WITH (security_invoker=true) AS
WITH candidates AS (
 SELECT e.id entity_id,e.canonical_key,e.label,
  bool_or(p.proposal_type='annex_ii_prohibited_substance_entry') AS has_prohibition_proposal,
  bool_or(p.proposal_type='annex_iii_professional_use_only') AS has_professional_use_proposal,
  count(*)::integer AS proposal_count,
  count(*) FILTER(WHERE p.review_status='pending')::integer AS pending_count,
  array_agg(DISTINCT p.instrument_eli) AS source_instruments,
  array_agg(DISTINCT p.proposal_type) AS proposal_types
 FROM public.nyxi_entities e
 JOIN public.nyxi_regulatory_proposals_v1 p ON p.ingredient_entity_id=e.id
 WHERE e.entity_type='ingredient' AND p.jurisdiction='EU' AND p.review_status<>'rejected'
 GROUP BY e.id,e.canonical_key,e.label
)
SELECT entity_id,canonical_key,label,
 CASE WHEN has_prohibition_proposal THEN 'PROHIBITED_CANDIDATE'
 WHEN has_professional_use_proposal THEN 'PROFESSIONAL_USE_ONLY_CANDIDATE'
 ELSE 'REVIEW_REQUIRED_UNCLASSIFIED' END AS proposed_eu_category,
 pending_count,proposal_count,source_instruments,proposal_types,
 'PENDING_INDEPENDENT_REVIEW'::text AS review_status,
 false AS publication_authorized,
 false AS product_specific_composition_known
FROM candidates;
REVOKE ALL ON public.nyxi_private_nail_regulatory_matrix_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.nyxi_private_nail_regulatory_matrix_v1 TO service_role;

-- Exactly two staged claims about Commission Regulation 2025/877 and TPO.
-- This is a source-anchored proposal for human legal review, NOT a public
-- validated legal fact. Idempotent; never writes to nyxi_regulatory_facts.
WITH proposed(proposal_key,proposal_type,primary_ordinal,candidate_text,candidate_effective_date) AS (
 VALUES
 ('eu-2025-877-tpo-annex-ii-entry-1731','annex_ii_prohibited_substance_entry',8,
 'Commission Regulation (EU) 2025/877 adds diphenyl(2,4,6-trimethylbenzoyl)phosphine oxide (TPO; CAS 75980-60-8) to Annex II entry 1731 of Regulation (EC) 1223/2009.',
 '2025-09-01'::date),
 ('eu-2025-877-tpo-annex-iii-entry-311-deleted','annex_iii_entry_deletion',10,
 'Commission Regulation (EU) 2025/877 deletes Annex III entry 311 (historical professional artificial-nail TPO exception), with application from 1 September 2025.',
 '2025-09-01'::date)
), candidates AS (
 SELECT p.*,e.id AS entity_id,s.id AS source_id,f.snapshot_id,f.id AS fragment_id,
  sn.sha256 AS snapshot_sha256,f.content_sha256 AS fragment_sha256,
  ctx.id AS context_fragment_id
 FROM proposed p
 JOIN public.nyxi_entities e ON e.canonical_key='ingredient:trimethylbenzoyl-diphenylphosphine-oxide'
 JOIN public.nyxi_sources s ON s.source_key='eu_regulation_2025_877'
 JOIN public.nyxi_evidence_fragments f ON f.source_id=s.id AND f.ordinal=p.primary_ordinal
 JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id
 JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id
  AND m.extraction_status='complete' AND m.metadata->>'sha256'=sn.sha256
 LEFT JOIN public.nyxi_evidence_fragments ctx ON ctx.source_id=s.id AND ctx.snapshot_id=sn.id
  AND ctx.ordinal=6
 WHERE (p.primary_ordinal=8 AND f.body_text ILIKE '%1731%' AND f.body_text ILIKE '%75980-60-8%')
    OR (p.primary_ordinal=10 AND f.body_text ILIKE '%entry 311 is deleted%')
)
INSERT INTO public.nyxi_regulatory_proposals_v1(
 proposal_key,ingredient_entity_id,source_id,snapshot_id,primary_fragment_id,
 jurisdiction,instrument_eli,proposal_type,candidate_text,candidate_effective_date,
 applicability_review,review_status,metadata)
SELECT proposal_key,entity_id,source_id,snapshot_id,fragment_id,
 'EU','https://eur-lex.europa.eu/eli/reg/2025/877/oj/eng',
 proposal_type,candidate_text,candidate_effective_date,
 'requires_consolidation_review','pending',
 jsonb_build_object(
 'original_snapshot_sha256',snapshot_sha256,'fragment_sha256',fragment_sha256,
 'related_recital_fragment_id',context_fragment_id,
 'extraction_role','unverified_private_legislative_candidate',
 'cross_source_link','2014 SCCS TPO opinion is historical, 2025/877 modifies legal status',
 'current_applicability_not_assessed',true,'no_publication',true,
 'requires_independent_legal_review',true,'requires_current_annex_verification',true,
 'provenance_kind','official_EUR_Lex_HTML')
FROM candidates ON CONFLICT(proposal_key) DO NOTHING;

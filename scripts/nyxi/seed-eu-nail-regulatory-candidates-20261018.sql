-- Reproducible private legislative/guidance proposals from new 2020/1682
-- and 2025 Commission Q&A originals. Does NOT write nyxi_regulatory_facts.
WITH rows(proposal_key,entity_key,source_key,fragment_ordinal,kind,candidate_text,effective_date,required_phrase,document_kind) AS (
VALUES
('eu-2020-1682-hema-professional-use-only','ingredient:2-hydroxyethyl-methacrylate','eu_regulation_2020_1682',8,
'annex_iii_professional_use_only','EU 2020/1682 Annex III entry 313: HEMA nail products professional use only; package warnings For professional use only and Can cause an allergic reaction.','2021-09-03'::date,'Professional use only','binding_regulation'),
('eu-2020-1682-di-hema-professional-use-only','ingredient:di-hema-trimethylhexyl-dicarbamate','eu_regulation_2020_1682',9,
'annex_iii_professional_use_only','EU 2020/1682 Annex III entry 314: Di-HEMA Trimethylhexyl Dicarbamate nail products professional use only; package warnings For professional use only and Can cause an allergic reaction.','2021-09-03'::date,'Professional use only','binding_regulation'),
('eu-2020-1682-hema-market-placement-transition','ingredient:2-hydroxyethyl-methacrylate','eu_regulation_2020_1682',9,
'transition_placing_on_market','From 3 June 2021 nonconforming products with HEMA may no longer be newly placed on the EU market.','2021-06-03'::date,'From 3 June 2021','binding_regulation'),
('eu-2020-1682-di-hema-market-placement-transition','ingredient:di-hema-trimethylhexyl-dicarbamate','eu_regulation_2020_1682',9,
'transition_placing_on_market','From 3 June 2021 nonconforming products with Di-HEMA TMHDC may no longer be newly placed on the EU market.','2021-06-03'::date,'From 3 June 2021','binding_regulation'),
('eu-2025-tpo-commission-qa-sellthrough','ingredient:trimethylbenzoyl-diphenylphosphine-oxide','eu_commission_tpo_nail_qa_2025',4,
'official_nonbinding_guidance_market_availability','Commission services explain that placing and making available TPO-containing cosmetics is prohibited from 1 September 2025, including previously marketed stock.','2025-09-01'::date,'making available','nonbinding_commission_services_guidance'),
('eu-2025-tpo-commission-qa-professional-use','ingredient:trimethylbenzoyl-diphenylphosphine-oxide','eu_commission_tpo_nail_qa_2025',5,
'official_nonbinding_guidance_professional_use','Commission services explain that professional technicians cannot use TPO-containing cosmetics in client services after 1 September 2025, even if purchased before.','2025-09-01'::date,'professional user','nonbinding_commission_services_guidance')
), eligible AS (
SELECT r.*,e.id entity_id,s.id source_id,s.canonical_url,sn.sha256 snapshot_sha,
f.id fragment_id,f.snapshot_id,f.content_sha256 fragment_sha
FROM rows r JOIN public.nyxi_entities e ON e.canonical_key=r.entity_key
JOIN public.nyxi_sources s ON s.source_key=r.source_key
JOIN public.nyxi_evidence_fragments f ON f.source_id=s.id AND f.ordinal=r.fragment_ordinal
 AND f.body_text ILIKE '%'||r.required_phrase||'%'
JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id
JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id AND m.extraction_status='complete'
 AND m.metadata->>'sha256'=sn.sha256
)
INSERT INTO public.nyxi_regulatory_proposals_v1(
proposal_key,ingredient_entity_id,source_id,snapshot_id,primary_fragment_id,
jurisdiction,instrument_eli,proposal_type,candidate_text,candidate_effective_date,
applicability_review,review_status,metadata)
SELECT proposal_key,entity_id,source_id,snapshot_id,fragment_id,'EU',canonical_url,
kind,candidate_text,effective_date,'requires_consolidation_review','pending',
jsonb_build_object('document_kind',document_kind,'original_sha256',snapshot_sha,
'fragment_sha256',fragment_sha,'candidate_not_current_law_verdict',true,
'separate_reviewer_required',true,'not_for_publication',true,
'do_not_conflate_prohibited_with_professional_use',true)
FROM eligible ON CONFLICT(proposal_key) DO NOTHING;

-- Source atlas registrations verified and archived 18 Oct 2026.
-- Registration alone grants NO right to acquire; asset-specific rights approvals
-- were separately evaluated and recorded in nyxi_asset_acquisition_approvals.
INSERT INTO public.nyxi_sources(
source_key,canonical_url,title,authority,jurisdiction,source_role,
expected_mime_type,acquisition_method,update_cadence,priority,status,metadata)
VALUES
('eu_regulation_2020_1682',
'https://eur-lex.europa.eu/eli/reg/2020/1682/oj/eng',
'Commission Regulation (EU) 2020/1682 — HEMA and Di-HEMA conditions',
'European Union','EU','law','text/html','html','event_driven',5,'discovered',
jsonb_build_object('official',true,'source_family','primary_legislation','scope','Annex III HEMA/Di-HEMA professional-only nail use','verified_reference_date','2026-10-18','exact_asset_approval_required',true)),
('eu_commission_tpo_nail_qa_2025',
'https://single-market-economy.ec.europa.eu/sectors/cosmetics/tpo-nail-products-questions-answers_en',
'European Commission — TPO in Nail Products Q&A',
'European Commission DG GROW','EU','regulatory_guidance','text/html','html','event_driven',4,'discovered',
jsonb_build_object('official',true,'source_family','official_nonbinding_guidance','not_legally_binding',true,'publication_date','2025-08-07','verified_reference_date','2026-10-18','exact_asset_approval_required',true)),
('eu_regulation_2026_78',
'https://eur-lex.europa.eu/eli/reg/2026/78/oj/eng',
'Commission Regulation (EU) 2026/78 — cosmetics CMR amendments',
'European Union','EU','law','text/html','html','event_driven',3,'discovered',
jsonb_build_object('official',true,'source_family','primary_legislation','applies_from','2026-05-01','no_assumption_regarding_TPO_or_HEMA',true,'verified_reference_date','2026-10-18','exact_asset_approval_required',true))
ON CONFLICT(source_key) DO NOTHING;
-- Never override a previously verified active source back to discovered.

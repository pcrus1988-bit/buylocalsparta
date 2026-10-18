-- Reproducible idempotent private identity backfill. Requires original evidence
-- to exist and have passed hash/provenance/extraction checks. No public claims.
WITH ids(entity_key,source_key,ord,document_ref,kind,identifier) AS (
VALUES
('ingredient:2-hydroxyethyl-methacrylate','eu_regulation_2020_1682',8,'EU 2020/1682 Annex III 313','CAS','868-77-9'),
('ingredient:2-hydroxyethyl-methacrylate','eu_regulation_2020_1682',8,'EU 2020/1682 Annex III 313','EC','212-782-2'),
('ingredient:2-hydroxyethyl-methacrylate','eu_regulation_2020_1682',8,'EU 2020/1682 Annex III 313','INCI','HEMA'),
('ingredient:di-hema-trimethylhexyl-dicarbamate','eu_regulation_2020_1682',9,'EU 2020/1682 Annex III 314','CAS','41137-60-4'),
('ingredient:di-hema-trimethylhexyl-dicarbamate','eu_regulation_2020_1682',9,'EU 2020/1682 Annex III 314','CAS','72869-86-4'),
('ingredient:di-hema-trimethylhexyl-dicarbamate','eu_regulation_2020_1682',9,'EU 2020/1682 Annex III 314','EC','255-239-5'),
('ingredient:di-hema-trimethylhexyl-dicarbamate','eu_regulation_2020_1682',9,'EU 2020/1682 Annex III 314','EC','276-957-5'),
('ingredient:di-hema-trimethylhexyl-dicarbamate','eu_regulation_2020_1682',9,'EU 2020/1682 Annex III 314','INCI','DI-HEMA TRIMETHYLHEXYL DICARBAMATE'),
('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','eu_regulation_2025_877',8,'EU 2025/877 Annex II 1731','CAS','75980-60-8'),
('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','eu_regulation_2025_877',8,'EU 2025/877 Annex II 1731','EC','278-355-8'),
('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','eu_regulation_2025_877',8,'EU 2025/877 Annex II 1731','INCI','Trimethylbenzoyl Diphenylphosphine Oxide')
), matched AS(
SELECT d.*,e.id entity_id,s.id source_id,f.id fragment_id,f.snapshot_id,
f.content_sha256 fragment_sha,sn.sha256 original_sha
FROM ids d JOIN public.nyxi_entities e ON e.canonical_key=d.entity_key
JOIN public.nyxi_sources s ON s.source_key=d.source_key
JOIN public.nyxi_evidence_fragments f ON f.source_id=s.id AND f.ordinal=d.ord AND f.body_text ILIKE '%'||d.identifier||'%'
JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id
JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id AND m.extraction_status='complete' AND m.metadata->>'sha256'=sn.sha256
)
INSERT INTO public.nyxi_ingredient_identity_assertions_v1(
assertion_key,entity_id,identifier_type,identifier_value,source_id,snapshot_id,fragment_id,
source_document_reference,review_status,entity_scope,metadata)
SELECT entity_key||':'||kind||':'||identifier,entity_id,kind,identifier,source_id,
snapshot_id,fragment_id,document_ref,'pending','candidate_chemical_identity',
jsonb_build_object('fragment_sha256',fragment_sha,'original_sha256',original_sha,
'identity_exact_legislative_mention',true,'no_product_composition_inference',true,
'no_publication',true,'review_required',true)
FROM matched ON CONFLICT(assertion_key) DO NOTHING;
-- PubChem references are external secondary lookups only, not scraped originals:
-- HEMA CID 13360, TPO CID 166480, Di-HEMA/UDMA CID 170472
-- (Di-HEMA can reference positional-isomer CAS values, so retain both).

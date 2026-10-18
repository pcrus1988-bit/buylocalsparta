-- Source-anchored private document/ingredient knowledge graph. This backfill
-- ONLY denotes documentary mentions; no product composition or law approval.
WITH nodes(type,key,label,source_key) AS (
VALUES
('legal_instrument','legal:eu-2020-1682','EU Regulation 2020/1682 — HEMA and Di-HEMA','eu_regulation_2020_1682'),
('legal_instrument','legal:eu-2025-877','EU Regulation 2025/877 — cosmetics CMR/TPO','eu_regulation_2025_877'),
('official_guidance','guidance:ec-tpo-nail-qa-2025','European Commission TPO Nail Products Q&A (nonbinding)','eu_commission_tpo_nail_qa_2025'),
('scientific_opinion','sccs:1592-17','SCCS Opinion 1592/17 (HEMA and Di-HEMA, 2018)','eu_sccs_hema_di_hema_2018_pdf'),
('scientific_opinion','sccs:1528-14','SCCS Opinion 1528/14 (TPO, 2014)','eu_sccs_tpo_2014_pdf')
)
INSERT INTO nyxi_entities(entity_type,canonical_key,label,aliases,properties)
SELECT type,key,label,ARRAY[]::text[],
jsonb_build_object('source_key',source_key,'lifecycle','candidate','visibility','private',
'review_required',true,'publication_authorized',false,'document_type',type,
'parser','nyxi-exact-source-legal-graph-v1')
FROM nodes ON CONFLICT(canonical_key) DO NOTHING;

WITH relations(from_key,to_key,source_key,ord,predicate,meaning) AS(
VALUES
('ingredient:2-hydroxyethyl-methacrylate','legal:eu-2020-1682','eu_regulation_2020_1682',8,'mentioned_in_legal_instrument','Annex III entry 313, private pending'),
('ingredient:di-hema-trimethylhexyl-dicarbamate','legal:eu-2020-1682','eu_regulation_2020_1682',9,'mentioned_in_legal_instrument','Annex III entry 314, private pending'),
('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','legal:eu-2025-877','eu_regulation_2025_877',8,'mentioned_in_legal_instrument','Annex II entry 1731, private pending'),
('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','guidance:ec-tpo-nail-qa-2025','eu_commission_tpo_nail_qa_2025',4,'discussed_in_nonbinding_guidance','Commission services Q&A, not binding law'),
('ingredient:2-hydroxyethyl-methacrylate','sccs:1592-17','eu_sccs_hema_di_hema_2018_pdf',0,'discussed_in_scientific_opinion','Historical scientific evidence only'),
('ingredient:di-hema-trimethylhexyl-dicarbamate','sccs:1592-17','eu_sccs_hema_di_hema_2018_pdf',0,'discussed_in_scientific_opinion','Historical scientific evidence only'),
('ingredient:trimethylbenzoyl-diphenylphosphine-oxide','sccs:1528-14','eu_sccs_tpo_2014_pdf',0,'discussed_in_scientific_opinion','Historical 2014 context, superseded legal framework')
), eligible AS(
SELECT r.*,src.id from_id,dst.id to_id,s.id source_id,f.id fragment_id,
f.snapshot_id,f.content_sha256 fragment_sha,sn.sha256 snapshot_sha
FROM relations r
JOIN nyxi_entities src ON src.canonical_key=r.from_key
JOIN nyxi_entities dst ON dst.canonical_key=r.to_key
JOIN nyxi_sources s ON s.source_key=r.source_key
JOIN nyxi_evidence_fragments f ON f.source_id=s.id AND f.ordinal=r.ord
JOIN nyxi_source_snapshots sn ON sn.id=f.snapshot_id
JOIN nyxi_corpus_manifest m ON m.snapshot_id=sn.id AND m.extraction_status='complete'
 AND m.metadata->>'sha256'=sn.sha256
)
INSERT INTO nyxi_graph_edges(from_entity_id,to_entity_id,predicate,fragment_id,snapshot_id,
source_id,confidence,metadata)
SELECT from_id,to_id,predicate,fragment_id,snapshot_id,source_id,0.67,
jsonb_build_object('extractor','nyxi-exact-source-legal-graph-v1','review_status','pending',
'fragment_sha256',fragment_sha,'snapshot_sha256',snapshot_sha,'interpretation',meaning,
'not_for_publication',true,'not_product_specific',true)
FROM eligible ON CONFLICT(from_entity_id,to_entity_id,predicate,fragment_id) DO NOTHING;

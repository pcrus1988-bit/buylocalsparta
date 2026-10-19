-- Idempotent NYXI staging for exact 2026 UK OPSS original HTML notices.
-- Both remain unpublished, unreviewed and unmatched to any merchant SKU.
WITH notices(notice_key,source_key,reference,kind,published,risk,risk_level,product,brand,model,action_text,evidence_token) AS(
 VALUES
 ('gb-opss-2602-0189-acrylic-nail-art-kit','gb_opss_nail_acrylic_kit_2602_0189',
 '2602-0189','product_recall','2026-02-21'::date,'chemical','Serious',
 'Acrylic Nail Art Kit with UV LED Lamp & Gel Polish Set sold via TikTok Shop',
 NULL::text,NULL::text,'Recall from end users and marketplace listing removal',
 '4-Vinylcyclohexene'),
 ('gb-opss-2608-0181-sun-nail-lamp','gb_opss_sun_nail_lamp_2608_0181',
 '2608-0181','product_safety_report','2026-08-21'::date,'electrical','High',
 'SUN Nail Art Lamp','SUN','SUN3',
 'Import rejected at border and product destruction','electric shock')
), evidence AS (
 SELECT n.*,s.id source_id,f.snapshot_id,f.id fragment_id,
  sn.sha256 source_sha,f.content_sha256 fragment_sha
 FROM notices n
 JOIN public.nyxi_sources s ON s.source_key=n.source_key AND s.source_role='recall_notice'
 JOIN public.nyxi_evidence_fragments f ON f.source_id=s.id AND f.ordinal=1
 JOIN public.nyxi_source_snapshots sn ON sn.id=f.snapshot_id
 JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id
   AND m.extraction_status='complete' AND m.metadata->>'sha256'=sn.sha256
 JOIN public.nyxi_extraction_runs r ON r.snapshot_id=sn.id AND r.status='complete'
 WHERE f.body_text ILIKE '%'||n.reference||'%'
   AND f.body_text ILIKE '%'||n.evidence_token||'%'
   AND f.body_text ILIKE '%Risk level: '||n.risk_level||'%'
)
INSERT INTO public.nyxi_product_safety_notice_candidates_v1(
 notice_key,jurisdiction,source_id,snapshot_id,fragment_id,notice_reference,
 notice_type,report_published_date,risk_type,risk_level_reported,
 product_name_reported,brand_reported,model_reported,action_reported,
 exact_product_match_status,review_status,metadata)
SELECT notice_key,'GB',source_id,snapshot_id,fragment_id,reference,
 kind,published,risk,risk_level,product,brand,model,action_text,
 'unmatched','pending',
 jsonb_build_object('source_key',source_key,'fragment_sha256',fragment_sha,
  'source_sha256',source_sha,
  'original_authority','UK Office for Product Safety and Standards',
  'source_scope','specific_report_not_entire_similar_product_range',
  'manufacturer_formula_not_verified',true,'no_ecommerce_sku_inference',true,
  'separate_product_identity_review_required',true,'date_matters',true,
  'not_for_public_search',true,'not_current_product_sale_status',true)
FROM evidence
ON CONFLICT(notice_key) DO NOTHING;

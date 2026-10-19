-- GB OPSS three exact original HTML assets, governed by OGL-v3.0.
-- This is a source- and asset-specific acquisition registry; no linked images,
-- PDFs, batch site crawling, public publication or ingredient safety conclusions.
-- Initial approval entries already applied in production 19 Oct 2026.
INSERT INTO public.nyxi_sources(
 source_key,canonical_url,title,authority,jurisdiction,source_role,
 expected_mime_type,acquisition_method,update_cadence,priority,status,metadata)
VALUES
('gb_opss_safety_alerts_index_html',
 'https://www.gov.uk/product-safety-alerts-reports-recalls',
 'UK OPSS Product Safety Alerts, Reports and Recalls — official index',
 'UK Office for Product Safety and Standards','GB','recall_system',
 'text/html','html','weekly',4,'discovered',
 jsonb_build_object('source_family','UK_official_recall_index',
 'scope','official index links and public title references only',
 'rights_policy_url','https://www.gov.uk/help/terms-conditions',
 'licence','Open Government Licence v3.0, except third-party copyright and logos',
 'no_link_following',true,'no_images',true,'report_not_independent_regulatory_verdict',true)),
('gb_opss_nail_acrylic_kit_2602_0189',
 'https://www.gov.uk/product-safety-alerts-reports-recalls/product-recall-acrylic-nail-art-kit-with-uv-led-lamp-and-gel-polish-set-sold-via-tiktok-shop-2602-0189',
 'UK OPSS recall 2602-0189 — Acrylic nail art kit with UV lamp and gel polish',
 'UK Office for Product Safety and Standards','GB','recall_notice',
 'text/html','html','event_driven',3,'discovered',
 jsonb_build_object('source_family','UK_official_product_recall',
 'case_id','2602-0189','date','2026-02-21',
 'rights_policy_url','https://www.gov.uk/help/terms-conditions',
 'licence','OGL v3.0, except third-party media and logos','no_images',true,
 'no_independent_product_safety_conclusion',true,'exact_url_only',true)),
('gb_opss_sun_nail_lamp_2608_0181',
 'https://www.gov.uk/product-safety-alerts-reports-recalls/product-safety-report-sun-nail-art-lamp-2608-0181',
 'UK OPSS safety report 2608-0181 — SUN Nail Art Lamp',
 'UK Office for Product Safety and Standards','GB','recall_notice',
 'text/html','html','event_driven',3,'discovered',
 jsonb_build_object('source_family','UK_official_product_safety_report',
 'case_id','2608-0181','date','2026-08-21',
 'rights_policy_url','https://www.gov.uk/help/terms-conditions',
 'licence','OGL v3.0, except third-party media and logos','no_images',true,
 'no_independent_product_safety_conclusion',true,'exact_url_only',true))
ON CONFLICT(source_key) DO NOTHING;

INSERT INTO public.nyxi_asset_acquisition_approvals(
 source_id,asset_url,rights_basis,rights_policy_url,attribution,retention_policy,
 approved_by,approved_at,review_due_at,expires_at,acquisition_authorized,
 mirror_authorized,approved_final_url,asset_kind,acquisition_method,retention_until,metadata)
SELECT s.id,s.canonical_url,
 'Official UK GOV.UK original Crown-copyright text reusable under OGL-v3.0 including commercial use; exclude personal data, departmental logos, third-party media and exceptions; exact HTML asset only.',
 'https://www.gov.uk/help/terms-conditions',
 'Contains public sector information licensed under the Open Government Licence v3.0. Source: UK Office for Product Safety and Standards / GOV.UK; no official endorsement.',
 'One original private HTML per approved URL with SHA-256, no linked content or third-party media and separate publication review.',
 'AI-assisted exact gov.uk OGL3 terms / official page review, 19 Oct 2026',
 now(),now()+interval '30 days',now()+interval '90 days',true,false,
 s.canonical_url,'html_original','http',now()+interval '365 days',
 jsonb_build_object(
  'asset_id','nyxi-20261019-'||s.source_key||'-original-html-v1',
  'source_key',s.source_key,'mime','text/html','method','GET',
  'governance_approved',true,'reviewed_on','2026-10-19',
  'policy_family','UK_OPSS_OG_L_3',
  'policy_url','https://www.gov.uk/help/terms-conditions',
  'licence_url','https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'no_images',true,'no_link_following',true,'no_public_release',true,'no_bulk_crawl',true,
  'redirect_policy','exact_url_only','robots_delay_seconds',90,
  'rights_scope','Original official HTML text only: excludes third-party works, product images, logos, personal data, linked PDF',
  'disclaimer','Private archive, no independently validated product safety conclusion')
FROM public.nyxi_sources s
WHERE s.source_key IN (
 'gb_opss_safety_alerts_index_html',
 'gb_opss_nail_acrylic_kit_2602_0189',
 'gb_opss_sun_nail_lamp_2608_0181')
ON CONFLICT(source_id,asset_url) DO NOTHING;

-- Discovery-only registration. Open Beauty Facts product records are community
-- contributed under ODbL 1.0 / DbCL 1.0; image rights separate (CC BY-SA).
-- A standalone/compliant attribution and share-alike strategy is required
-- BEFORE copying any content into NYXI, and product formulas/HEX are not verified.
INSERT INTO public.nyxi_sources(
 source_key,canonical_url,title,authority,jurisdiction,source_role,
 expected_mime_type,acquisition_method,update_cadence,priority,status,metadata)
VALUES(
 'community_open_beauty_facts_products',
 'https://world.openbeautyfacts.org',
 'Open Beauty Facts — community cosmetic product data and labels',
 'Open Beauty Facts / Open Food Facts','Global','open_cosmetics_database',
 'application/json','api','weekly',9,'discovered',
 jsonb_build_object(
  'rights_review_status','ODbL_share_alike_implementation_review_required',
  'rights_policy_url','https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/',
  'project_site','https://github.com/openfoodfacts/openbeautyfacts',
  'official_base_api','https://world.openbeautyfacts.org/api/v2/search',
  'database_license','ODbL-1.0','content_license','DbCL-1.0',
  'image_license','CC-BY-SA, separate rights review',
  'commercial_reuse_principle','Allowed in principle with proper attribution and ODbL/DbCL share-alike obligations',
  'acquisition_gate','NOT approved; segregate adapted open database, attribution, upstream updates, rate limits and image licensing before collecting any product',
  'source_quality','Community contributed, not manufacturer verified; do not infer current formula or exact swatch',
  'exclude_product_images',true,'exclude_unverified_shade_hex',true,
  'no_public_release',true,'reviewed_on','2026-10-19'))
ON CONFLICT(source_key) DO NOTHING;

-- No asset-acquisition approval is created by this script.

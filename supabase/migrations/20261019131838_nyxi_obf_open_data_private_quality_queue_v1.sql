-- Recovered verbatim from Supabase production migration history, 2026-10-19.

CREATE OR REPLACE VIEW nyxi_open_data.obf_nail_quality_queue_v1 WITH (security_invoker=true) AS
SELECT b.id AS batch_id,b.requested_page,coalesce(x.item->>'code','') AS submitted_barcode,
 coalesce(x.item->>'product_name','') AS submitted_product_name,
 coalesce(x.item->>'brands','') AS community_brand_string,
 CASE WHEN coalesce(x.item->>'code','') !~ '^[0-9]{8,14}$' THEN 'invalid_or_missing_barcode'
 WHEN length(trim(coalesce(x.item->>'product_name',''))) NOT BETWEEN 2 AND 650 THEN 'missing_or_invalid_product_name'
 WHEN NOT coalesce(x.item->'categories_tags','[]'::jsonb) ? 'en:nail-polishes' THEN 'wrong_or_missing_category'
 ELSE 'review_required' END AS exclusion_reason,
 'OBF community item is NOT a manufacturer-verified formula or shade'::text AS provenance_warning,
 b.raw_response_sha256
FROM nyxi_open_data.obf_nail_api_batches_v1 b
CROSS JOIN LATERAL jsonb_array_elements(b.raw_response_body::jsonb->'products') x(item)
WHERE coalesce(x.item->>'code','') !~ '^[0-9]{8,14}$'
 OR length(trim(coalesce(x.item->>'product_name',''))) NOT BETWEEN 2 AND 650
 OR NOT coalesce(x.item->'categories_tags','[]'::jsonb) ? 'en:nail-polishes';
REVOKE ALL ON nyxi_open_data.obf_nail_quality_queue_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON nyxi_open_data.obf_nail_quality_queue_v1 TO service_role;

CREATE OR REPLACE VIEW nyxi_open_data.obf_nail_private_review_v1 WITH (security_invoker=true) AS
SELECT p.barcode,p.product_name,p.brands_as_entered,p.ingredient_label_as_entered,
 p.categories_tags,p.source_product_url,p.source_last_modified_t,
 b.requested_page,b.raw_response_sha256,
 p.community_verified_by_manufacturer,p.product_variant_sku_confirmed,
 p.shade_hex_confirmed,p.publication_approved,
 'Open Beauty Facts contributors; ODbL 1.0 / DbCL 1.0, no images'::text AS attribution_and_license
FROM nyxi_open_data.obf_nail_products_v1 p
JOIN nyxi_open_data.obf_nail_api_batches_v1 b ON b.id=p.raw_batch_id;
REVOKE ALL ON nyxi_open_data.obf_nail_private_review_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON nyxi_open_data.obf_nail_private_review_v1 TO service_role;


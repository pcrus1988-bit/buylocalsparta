-- NYXI: metadata-only intake from the 283-source Atlas and later discoveries.
-- Run AFTER the private brand/line/shade migration.
-- This does NOT access, download, reproduce, or license any manufacturer's assets.
-- A source's authority is a publisher/origin candidate, NOT verified brand identity.
-- Safe to rerun: all inserts use stable source keys and ON CONFLICT DO NOTHING.

INSERT INTO public.nyxi_nail_brand_publishers_v1(
 publisher_key,publisher_name,identity_status,metadata)
SELECT DISTINCT 'atlas-authority:'||md5(lower(trim(s.authority))),
 trim(s.authority),'source_atlas_publisher_unresolved',
 jsonb_build_object('origin','nyxi_sources.authority',
 'relation','publisher_or_brand_unresolved','verified_brand',false,
 'collection_rights_granted',false,'manufacturer_products_ingested',false,
 'no_guessing_shades_or_hex',true,'source_atlas_mapped_on','2026-10-19')
FROM public.nyxi_sources s
WHERE s.source_role LIKE 'manufacturer%' AND s.status='discovered'
 AND NULLIF(trim(s.authority),'') IS NOT NULL
ON CONFLICT(publisher_key) DO NOTHING;

-- Separate statement is intentional: reading rows inserted into the previous
-- statement via a self-referential data-modifying CTE did not resolve links.
INSERT INTO public.nyxi_nail_publisher_sources_v1(
 publisher_id,source_id,relationship,review_status,metadata)
SELECT p.id,s.id,'source_atlas_publisher','pending',
 jsonb_build_object('source_role',s.source_role,'registry_status',s.status,
 'permission_not_inferred_from_discovery',true,
 'source_requires_specific_rights_review',true)
FROM public.nyxi_sources s
JOIN public.nyxi_nail_brand_publishers_v1 p
 ON p.publisher_key='atlas-authority:'||md5(lower(trim(s.authority)))
WHERE s.source_role LIKE 'manufacturer%' AND s.status='discovered'
 AND NULLIF(trim(s.authority),'') IS NOT NULL
ON CONFLICT(publisher_id,source_id) DO NOTHING;

-- IMPORTANT: no INSERT into lines, shades, measured HEX, source snapshots,
-- extraction runs, or publication approvals happens in this script.

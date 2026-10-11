-- NYXI Agent 1. READ-ONLY, fail-closed Gelish / Morgan Taylor rights-gate regression.
-- A successful zero-approval check does NOT itself grant permission.
WITH targets(source_key) AS (
 VALUES
 ('gelish_collections_index'),
 ('gelish_color_plus_all'),
 ('gelish_colour_catalogue'),
 ('gelish_core_catalog_pdf'),
 ('gelish_root'),
 ('gelish_system_page'),
 ('morgan_taylor_colours'),
 ('morgan_taylor_system')
), verified AS (
 SELECT t.source_key, s.id, s.canonical_url, s.status,
        a.id AS approval_id, a.acquisition_authorized, a.mirror_authorized
 FROM targets t
 LEFT JOIN public.nyxi_sources s ON s.source_key = t.source_key
 LEFT JOIN public.nyxi_asset_acquisition_approvals a ON a.source_id = s.id
)
SELECT
 count(DISTINCT source_key) = 8 AS eight_target_keys,
 count(DISTINCT id) = 8 AS eight_source_uuids,
 count(DISTINCT canonical_url) = 8 AS eight_unique_urls,
 count(DISTINCT source_key) FILTER (WHERE status = 'discovered') = 8 AS all_discovered,
 count(DISTINCT source_key) FILTER (WHERE canonical_url LIKE 'https://gelish.com/%') = 7 AS seven_main_host,
 count(DISTINCT source_key) FILTER (WHERE canonical_url LIKE 'https://o.gelish.com/%') = 1 AS one_subdomain,
 count(DISTINCT approval_id) = 0 AS zero_asset_approval_rows,
 count(*) FILTER (WHERE acquisition_authorized IS TRUE) = 0 AS zero_acquisition_grants,
 count(*) FILTER (WHERE mirror_authorized IS TRUE) = 0 AS zero_mirror_grants
FROM verified;

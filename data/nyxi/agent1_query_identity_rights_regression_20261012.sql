-- NYXI Agent 1 / #1460 — query-sensitive source identity and exact-asset rights.
-- 2026-10-12. Read-only. No URLs, private evidence, tokens or source payloads returned.
-- Critical distinction: an operational dedup key MAY remove query parameters
-- for candidate grouping, but MUST NOT merge source identities or transfer rights.
-- In particular, Hermès hands catalogue and nail-polish facet have distinct URLs.
-- Query parameters on official regulatory PDFs, recall filters, and document
-- repositories may likewise change content or grant access; never strip blindly.
-- Acquisition requires exact source UUID + approved asset URL + final URL, not
-- normalized host/path or the registry's discovered/verified/active label.

WITH src AS (
 SELECT id,source_key,canonical_url,
   lower(regexp_replace(regexp_replace(regexp_replace(
     canonical_url,'^https?://(www\\.)?','','i'),'[?#].*$',''),'/+$','')) AS path_only
 FROM public.nyxi_sources
), hermes AS (
 SELECT count(*) AS n,count(DISTINCT canonical_url) AS unique_urls,
   count(*) FILTER (WHERE source_key='hermes_nail_polish_gr'
     AND canonical_url LIKE '%?facet_category=vernis_ongles') AS facet_present,
   count(DISTINCT path_only) AS path_only_keys
 FROM src WHERE source_key IN ('hermes_hands_gr','hermes_nail_polish_gr')
), facts AS (
 SELECT
  (SELECT count(*) FROM src) AS sources,
  (SELECT count(DISTINCT id) FROM src) AS unique_ids,
  (SELECT count(DISTINCT canonical_url) FROM src) AS unique_urls,
  (SELECT count(*) FROM src WHERE canonical_url LIKE '%?%') AS parameterized,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals a
     JOIN src s ON s.id=a.source_id
     WHERE s.canonical_url LIKE '%?%' AND a.acquisition_authorized) AS approved_parameterized,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals a
     JOIN src s ON s.id=a.source_id
     WHERE a.acquisition_authorized
       AND (a.asset_url IS DISTINCT FROM s.canonical_url
         OR a.approved_final_url IS DISTINCT FROM a.asset_url)) AS approved_url_mismatch,
  (SELECT count(*) FROM public.nyxi_asset_acquisition_approvals a
     JOIN src s ON s.id=a.source_id
     WHERE s.source_key IN ('hermes_hands_gr','hermes_nail_polish_gr')) AS hermes_approvals,
  (SELECT count(*) FROM (
    SELECT path_only FROM src GROUP BY path_only HAVING count(*)>1
  ) c) AS path_only_collisions
)
SELECT test_name, passed, observation FROM (
 SELECT 'unique_source_uuid_and_exact_url' AS test_name,
    sources=unique_ids AND sources=unique_urls AS passed,
    'registered='||sources||'; unique_urls='||unique_urls AS observation FROM facts
 UNION ALL SELECT 'query_parameters_present_and_not_authorized',
    parameterized=7 AND approved_parameterized=0,
    'parameterized='||parameterized||'; authorized='||approved_parameterized FROM facts
 UNION ALL SELECT 'approved_assets_exact_url_contract',
    approved_url_mismatch=0,
    'mismatches='||approved_url_mismatch FROM facts
 UNION ALL SELECT 'hermes_distinct_full_urls',
    n=2 AND unique_urls=2 AND facet_present=1,
    'source_keys='||n||'; distinct_urls='||unique_urls||'; facet_present='||facet_present FROM hermes
 UNION ALL SELECT 'hermes_path_only_collision_is_not_a_duplicate',
    n=2 AND path_only_keys=1,
    'path_only_keys='||path_only_keys||'; full_urls='||unique_urls FROM hermes
 UNION ALL SELECT 'hermes_no_approval_inheritance',
    hermes_approvals=0,
    'approvals='||hermes_approvals FROM facts
 UNION ALL SELECT 'review_candidate_path_only_collisions',
    path_only_collisions=1,
    'path_only_collision_groups='||path_only_collisions FROM facts
) tests ORDER BY test_name;

-- Human review: preserve exact query string, source UUID, content scope and
-- publisher identity. Do not auto-merge the Hermès pair or authorize any asset.
-- Agent 2: only the three existing exact FDA approval IDs are eligible;
-- no parameterized source in this audit is newly authorized. Mirror rights: none.

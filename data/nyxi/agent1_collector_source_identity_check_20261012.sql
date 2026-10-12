-- Read-only NYXI source identity consistency check.
SELECT count(*) AS mismatches
FROM public.nyxi_asset_acquisition_approvals a
LEFT JOIN public.nyxi_sources s ON s.id=a.source_id
WHERE s.id IS NULL
   OR a.asset_url IS DISTINCT FROM s.canonical_url
   OR a.approved_final_url IS NULL
   OR a.approved_final_url IS DISTINCT FROM a.asset_url;

-- NYXI Agent 1 | issue #1460 | 2026-10-12
-- READ-ONLY regression: snapshot -> manifest -> exact asset approval.
-- Asset rights are never inferred from registry status or source metadata.
-- A passing historical check is NOT permission for a future acquisition.
-- Keep conflicting migrations 0435/0436 untouched.
WITH chain AS (
 SELECT sn.id AS snapshot_id, sn.source_id AS snapshot_source, sn.final_url,
        sn.provenance->>'asset_approval_id' AS provenance_approval,
        m.id AS manifest_id, m.source_id AS manifest_source,
        m.metadata->>'asset_approval_id' AS manifest_approval,
        m.mirrored_to_drive, m.drive_file_id,
        a.id AS approval_id, a.source_id AS approval_source,
        a.asset_url, a.approved_final_url
 FROM public.nyxi_source_snapshots sn
 LEFT JOIN public.nyxi_corpus_manifest m ON m.snapshot_id=sn.id
 LEFT JOIN public.nyxi_asset_acquisition_approvals a
   ON a.id::text=sn.provenance->>'asset_approval_id'
), violations AS (
 SELECT snapshot_id,
   (manifest_id IS NULL OR approval_id IS NULL
    OR provenance_approval IS NULL OR manifest_approval IS NULL
    OR provenance_approval IS DISTINCT FROM manifest_approval
    OR snapshot_source IS DISTINCT FROM manifest_source
    OR snapshot_source IS DISTINCT FROM approval_source
    OR final_url IS DISTINCT FROM asset_url
    OR approved_final_url IS DISTINCT FROM asset_url
    OR mirrored_to_drive IS TRUE OR drive_file_id IS NOT NULL) AS broken
 FROM chain
), cases AS (
 SELECT * FROM (VALUES
  ('valid',true,true,true,true,false,false),
  ('manifest_approval_swapped',true,false,true,true,false,false),
  ('manifest_source_swapped',true,true,false,true,false,false),
  ('snapshot_url_swapped',true,true,true,false,false,false),
  ('unexpected_drive_mirror',true,true,true,true,true,false),
  ('drive_file_id_without_flag',true,true,true,true,false,true)
 ) AS v(label,has_approval,approval_ids_equal,source_ids_equal,urls_equal,mirrored,drive_file_id_present)
), evaluated AS (
 SELECT label, (has_approval AND approval_ids_equal AND source_ids_equal AND urls_equal
 AND NOT mirrored AND NOT drive_file_id_present) AS allowed FROM cases
)
SELECT 'live_snapshot_manifest_approval_chain' AS test,
       count(*) FILTER (WHERE broken)=0 AS passed,
       count(*)::text || ' snapshots, ' || count(*) FILTER (WHERE broken)::text || ' violations' AS observed FROM violations
UNION ALL
SELECT 'synthetic_valid_case',bool_and(allowed),count(*)::text FROM evaluated WHERE label='valid'
UNION ALL
SELECT 'synthetic_negative_cases',bool_and(NOT allowed),count(*)::text FROM evaluated WHERE label<>'valid';

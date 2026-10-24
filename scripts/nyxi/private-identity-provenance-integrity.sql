-- NYXI Agent 3 private-only, read-only production integrity diagnostic.
-- Output is counts only: no UUIDs, INCI labels, source URLs, or private fragments.
-- Zero anomalies is necessary for consistency, not proof of provenance, rights, safety, or approval.
-- Hash checks validate declared hexadecimal metadata only; they DO NOT hash archived bytes.
WITH anomalies AS (
  SELECT 'fragment_snapshot_missing' AS code, count(*) AS n
    FROM public.nyxi_evidence_fragments f
    LEFT JOIN public.nyxi_source_snapshots s ON s.id=f.snapshot_id
    WHERE s.id IS NULL
  UNION ALL SELECT 'snapshot_source_missing',count(*)
    FROM public.nyxi_source_snapshots s
    LEFT JOIN public.nyxi_sources src ON src.id=s.source_id
    WHERE src.id IS NULL
  UNION ALL SELECT 'fragment_source_missing',count(*)
    FROM public.nyxi_evidence_fragments f
    LEFT JOIN public.nyxi_sources src ON src.id=f.source_id
    WHERE src.id IS NULL
  UNION ALL SELECT 'snapshot_sha256_bad_format',count(*)
    FROM public.nyxi_source_snapshots s
    WHERE s.sha256 IS NULL OR s.sha256 !~ '^[a-fA-F0-9]{64}$'
  UNION ALL SELECT 'fragment_sha256_bad_format',count(*)
    FROM public.nyxi_evidence_fragments f
    WHERE f.content_sha256 IS NULL OR f.content_sha256 !~ '^[a-fA-F0-9]{64}$'
  UNION ALL SELECT 'fragment_snapshot_source_mismatch',count(*)
    FROM public.nyxi_evidence_fragments f
    JOIN public.nyxi_source_snapshots s ON s.id=f.snapshot_id
    WHERE f.source_id IS DISTINCT FROM s.source_id
  UNION ALL SELECT 'duplicate_snapshot_fragment_key',count(*)
    FROM (SELECT snapshot_id,fragment_key FROM public.nyxi_evidence_fragments
          GROUP BY 1,2 HAVING count(*)>1) d
  UNION ALL SELECT 'duplicate_publisher_key_ci',count(*)
    FROM (SELECT lower(publisher_key) FROM public.nyxi_nail_brand_publishers_v1
          GROUP BY 1 HAVING count(*)>1) d
  UNION ALL SELECT 'product_line_missing_publisher',count(*)
    FROM public.nyxi_nail_product_lines_v1 l
    LEFT JOIN public.nyxi_nail_brand_publishers_v1 p ON p.id=l.publisher_id
    WHERE p.id IS NULL
  UNION ALL SELECT 'duplicate_line_key_per_publisher_ci',count(*)
    FROM (SELECT publisher_id,lower(line_key) FROM public.nyxi_nail_product_lines_v1
          GROUP BY 1,2 HAVING count(*)>1) d
  UNION ALL SELECT 'publisher_source_missing_publisher',count(*)
    FROM public.nyxi_nail_publisher_sources_v1 ps
    LEFT JOIN public.nyxi_nail_brand_publishers_v1 p ON p.id=ps.publisher_id
    WHERE p.id IS NULL
  UNION ALL SELECT 'publisher_source_missing_source',count(*)
    FROM public.nyxi_nail_publisher_sources_v1 ps
    LEFT JOIN public.nyxi_sources src ON src.id=ps.source_id
    WHERE src.id IS NULL
  UNION ALL SELECT 'duplicate_inci_assertion_key_ci',count(*)
    FROM (SELECT lower(assertion_key) FROM public.nyxi_ingredient_identity_assertions_v1
          GROUP BY 1 HAVING count(*)>1) d
  UNION ALL SELECT 'inci_source_missing',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1 i
    LEFT JOIN public.nyxi_sources src ON src.id=i.source_id
    WHERE i.source_id IS NOT NULL AND src.id IS NULL
  UNION ALL SELECT 'inci_snapshot_source_mismatch',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1 i
    JOIN public.nyxi_source_snapshots s ON s.id=i.snapshot_id
    WHERE i.source_id IS DISTINCT FROM s.source_id
  UNION ALL SELECT 'inci_snapshot_missing',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1 i
    LEFT JOIN public.nyxi_source_snapshots s ON s.id=i.snapshot_id
    WHERE i.snapshot_id IS NOT NULL AND s.id IS NULL
  UNION ALL SELECT 'inci_fragment_missing',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1 i
    LEFT JOIN public.nyxi_evidence_fragments f ON f.id=i.fragment_id
    WHERE i.fragment_id IS NOT NULL AND f.id IS NULL
  UNION ALL SELECT 'inci_fragment_source_mismatch',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1 i
    JOIN public.nyxi_evidence_fragments f ON f.id=i.fragment_id
    WHERE i.source_id IS DISTINCT FROM f.source_id
  UNION ALL SELECT 'inci_fragment_snapshot_mismatch',count(*)
    FROM public.nyxi_ingredient_identity_assertions_v1 i
    JOIN public.nyxi_evidence_fragments f ON f.id=i.fragment_id
    WHERE i.snapshot_id IS DISTINCT FROM f.snapshot_id
)
SELECT code,n FROM anomalies ORDER BY code;
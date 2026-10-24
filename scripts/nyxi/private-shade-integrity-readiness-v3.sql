-- NYXI Agent 3 | PRIVATE, READ-ONLY shade integrity diagnostic v3.
-- Supersedes v2 diagnostic's permissive HEX OR LAB logic and omission of OKLab.
-- Aggregate metadata only; never return private source IDs, URLs or fragment text.
-- Passing does NOT establish manufacturer rights, color calibration, chemical
-- safety, independent review, or publication authorization.
WITH variants AS (
  SELECT v.id, v.shade_entity_id,
    (l.id IS NOT NULL AND nullif(btrim(v.variant_key),'') IS NOT NULL) AS parent_and_key_ok,
    (v.manufacturer_sku IS NOT NULL AND nullif(btrim(v.manufacturer_sku),'') IS NOT NULL) AS sku_present,
    (v.pack_size_ml IS NULL OR v.pack_size_ml > 0) AS pack_size_ok,
    count(*) OVER (PARTITION BY v.line_id, lower(btrim(v.variant_key))) AS variant_key_count,
    count(*) FILTER (WHERE nullif(btrim(v.manufacturer_sku),'') IS NOT NULL)
      OVER (PARTITION BY v.line_id, lower(btrim(v.manufacturer_sku))) AS sku_count
  FROM public.nyxi_nail_shade_variants_v1 v
  LEFT JOIN public.nyxi_nail_product_lines_v1 l ON l.id = v.line_id
), measurements AS (
  SELECT m.id, m.shade_entity_id,
    (s.id IS NOT NULL AND f.id IS NOT NULL
      AND s.source_id = m.source_id
      AND f.source_id = m.source_id
      AND f.snapshot_id = m.snapshot_id) IS TRUE AS ancestry_ok,
    (s.sha256 ~ '^[0-9a-fA-F]{64}$'
      AND f.content_sha256 ~ '^[0-9a-fA-F]{64}$'
      AND s.storage_bucket = 'nyxi-evidence'
      AND nullif(btrim(s.storage_path),'') IS NOT NULL
      AND s.http_status = 200) IS TRUE AS evidence_metadata_ok,
    (m.confidence IS NOT NULL AND m.confidence BETWEEN 0 AND 1) IS TRUE AS confidence_ok,
    (nullif(btrim(m.measurement_key),'') IS NOT NULL
      AND nullif(btrim(m.measurement_method),'') IS NOT NULL
      AND nullif(btrim(m.color_space),'') IS NOT NULL) IS TRUE AS method_metadata_ok,
    -- Fail closed on EVERY supplied representation. Require at least one.
    -- An invalid LAB or OKLab tuple cannot be masked by a valid HEX, etc.
    (
      (m.derived_hex IS NULL OR (m.derived_hex ~ '^#[0-9a-fA-F]{6}$') IS TRUE)
      AND (
        (m.lab_l IS NULL AND m.lab_a IS NULL AND m.lab_b IS NULL)
        OR (m.lab_l BETWEEN 0 AND 100 AND m.lab_a BETWEEN -200 AND 200
            AND m.lab_b BETWEEN -200 AND 200) IS TRUE
      )
      AND (
        (m.oklab_l IS NULL AND m.oklab_a IS NULL AND m.oklab_b IS NULL)
        OR (m.oklab_l BETWEEN 0 AND 1 AND m.oklab_a BETWEEN -1 AND 1
            AND m.oklab_b BETWEEN -1 AND 1) IS TRUE
      )
      AND (m.derived_hex IS NOT NULL OR m.lab_l IS NOT NULL OR m.lab_a IS NOT NULL
           OR m.lab_b IS NOT NULL OR m.oklab_l IS NOT NULL OR m.oklab_a IS NOT NULL
           OR m.oklab_b IS NOT NULL)
    ) IS TRUE AS color_representation_ok,
    count(*) OVER (PARTITION BY m.shade_entity_id, lower(btrim(m.measurement_key))) AS measurement_key_count
  FROM public.nyxi_shade_measurements m
  LEFT JOIN public.nyxi_source_snapshots s ON s.id = m.snapshot_id
  LEFT JOIN public.nyxi_evidence_fragments f ON f.id = m.fragment_id
), links AS (
  SELECT c.id,
    (v.id IS NOT NULL AND m.id IS NOT NULL
      AND v.shade_entity_id IS NOT NULL
      AND v.shade_entity_id = m.shade_entity_id) IS TRUE AS endpoints_match,
    count(*) OVER (PARTITION BY c.variant_id,c.measurement_id) AS pair_count
  FROM public.nyxi_nail_shade_color_links_v1 c
  LEFT JOIN public.nyxi_nail_shade_variants_v1 v ON v.id = c.variant_id
  LEFT JOIN public.nyxi_shade_measurements m ON m.id = c.measurement_id
)
SELECT
  (SELECT count(*) FROM variants) AS shade_variants,
  (SELECT count(*) FROM variants WHERE parent_and_key_ok IS NOT TRUE) AS variant_parent_or_key_flags,
  (SELECT count(*) FROM variants WHERE variant_key_count > 1) AS duplicate_variant_key_rows,
  (SELECT count(*) FROM variants WHERE sku_present IS NOT TRUE) AS missing_manufacturer_sku,
  (SELECT count(*) FROM variants WHERE sku_count > 1) AS duplicate_manufacturer_sku_rows,
  (SELECT count(*) FROM variants WHERE pack_size_ok IS NOT TRUE) AS invalid_pack_size_rows,
  (SELECT count(*) FROM measurements) AS shade_measurements,
  (SELECT count(*) FROM measurements WHERE ancestry_ok IS NOT TRUE) AS measurement_ancestry_flags,
  (SELECT count(*) FROM measurements WHERE evidence_metadata_ok IS NOT TRUE) AS evidence_metadata_flags,
  (SELECT count(*) FROM measurements WHERE confidence_ok IS NOT TRUE) AS confidence_flags,
  (SELECT count(*) FROM measurements WHERE method_metadata_ok IS NOT TRUE) AS method_metadata_flags,
  (SELECT count(*) FROM measurements WHERE color_representation_ok IS NOT TRUE) AS color_representation_flags,
  (SELECT count(*) FROM measurements WHERE measurement_key_count > 1) AS duplicate_measurement_key_rows,
  (SELECT count(*) FROM links) AS shade_color_links,
  (SELECT count(*) FROM links WHERE endpoints_match IS NOT TRUE) AS link_identity_flags,
  (SELECT count(*) FROM links WHERE pair_count > 1) AS duplicate_link_pair_rows,
  false AS physical_calibration_established,
  false AS chemical_safety_established,
  false AS independent_review_established,
  false AS publication_authorized;

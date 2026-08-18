-- Buy Local Sparta — catalogue schema completeness and explicit data-quality gates.
-- Existing products are not silently suppressed; readiness is observable so catalogue
-- operations can correct legacy/source gaps before enforcing publication gates.

BEGIN;

-- Material is naturally multi-valued (e.g. cotton + polyester, metal + plastic).
UPDATE attribute_definitions
SET data_type='multienum', updated_at=now()
WHERE code='material' AND data_type='enum';

CREATE TABLE catalog_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  family_id uuid REFERENCES product_families(id) ON DELETE CASCADE,
  canonical_variant_id uuid REFERENCES canonical_variants(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES vendor_product_submissions(id) ON DELETE CASCADE,
  issue_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','blocking')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','waived')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution text,
  CHECK (num_nonnulls(family_id,canonical_variant_id,submission_id) >= 1),
  CHECK (length(btrim(issue_code)) > 0),
  CHECK ((status='open' AND resolved_at IS NULL) OR status IN ('resolved','waived'))
);

CREATE UNIQUE INDEX catalog_quality_issue_open_unique_idx
  ON catalog_quality_issues (
    issue_code,
    COALESCE(family_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(canonical_variant_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(submission_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status='open';
CREATE INDEX catalog_quality_issues_variant_idx
  ON catalog_quality_issues(canonical_variant_id,status,severity);
CREATE INDEX catalog_quality_issues_family_idx
  ON catalog_quality_issues(family_id,status,severity);

COMMENT ON TABLE catalog_quality_issues IS
  'Explicit catalogue master-data issues. Blocking issues prevent future publish-readiness but do not retroactively rewrite historical orders or silently delete current records.';

-- Family-level required schema completeness.
CREATE VIEW catalog_family_schema_completeness AS
SELECT
  pf.id AS family_id,
  pf.product_type_id,
  pt.code AS product_type_code,
  (
    SELECT count(*)
    FROM product_type_attributes pta
    WHERE pta.product_type_id=pf.product_type_id
      AND pta.value_level='family'
      AND pta.requirement_level='required'
  ) AS required_attribute_count,
  (
    SELECT count(*)
    FROM product_type_attributes pta
    WHERE pta.product_type_id=pf.product_type_id
      AND pta.value_level='family'
      AND pta.requirement_level='required'
      AND EXISTS (
        SELECT 1 FROM product_family_attribute_values fav
        WHERE fav.family_id=pf.id AND fav.attribute_id=pta.attribute_id
      )
  ) AS present_required_attribute_count,
  COALESCE((
    SELECT jsonb_agg(ad.code ORDER BY pta.sort_order,ad.code)
    FROM product_type_attributes pta
    JOIN attribute_definitions ad ON ad.id=pta.attribute_id
    WHERE pta.product_type_id=pf.product_type_id
      AND pta.value_level='family'
      AND pta.requirement_level='required'
      AND NOT EXISTS (
        SELECT 1 FROM product_family_attribute_values fav
        WHERE fav.family_id=pf.id AND fav.attribute_id=pta.attribute_id
      )
  ),'[]'::jsonb) AS missing_required_attributes
FROM product_families pf
LEFT JOIN product_types pt ON pt.id=pf.product_type_id;

-- Variant-level required schema completeness, including family-level required fields.
CREATE VIEW catalog_variant_schema_completeness AS
SELECT
  cv.id AS canonical_variant_id,
  cv.family_id,
  pf.product_type_id,
  pt.code AS product_type_code,
  (
    SELECT count(*)
    FROM product_type_attributes pta
    WHERE pta.product_type_id=pf.product_type_id
      AND pta.value_level='variant'
      AND pta.requirement_level='required'
  ) AS required_variant_attribute_count,
  (
    SELECT count(*)
    FROM product_type_attributes pta
    WHERE pta.product_type_id=pf.product_type_id
      AND pta.value_level='variant'
      AND pta.requirement_level='required'
      AND EXISTS (
        SELECT 1 FROM canonical_variant_attribute_values vav
        WHERE vav.canonical_variant_id=cv.id AND vav.attribute_id=pta.attribute_id
      )
  ) AS present_required_variant_attribute_count,
  COALESCE((
    SELECT jsonb_agg(ad.code ORDER BY pta.sort_order,ad.code)
    FROM product_type_attributes pta
    JOIN attribute_definitions ad ON ad.id=pta.attribute_id
    WHERE pta.product_type_id=pf.product_type_id
      AND pta.value_level='variant'
      AND pta.requirement_level='required'
      AND NOT EXISTS (
        SELECT 1 FROM canonical_variant_attribute_values vav
        WHERE vav.canonical_variant_id=cv.id AND vav.attribute_id=pta.attribute_id
      )
  ),'[]'::jsonb) AS missing_required_variant_attributes,
  fc.missing_required_attributes AS missing_required_family_attributes,
  (
    SELECT count(*) FROM catalog_quality_issues qi
    WHERE qi.status='open' AND qi.severity='blocking'
      AND (qi.canonical_variant_id=cv.id OR qi.family_id=cv.family_id)
  ) AS open_blocking_issue_count
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
LEFT JOIN product_types pt ON pt.id=pf.product_type_id
LEFT JOIN catalog_family_schema_completeness fc ON fc.family_id=pf.id;

CREATE VIEW catalog_variant_publish_readiness AS
SELECT
  cvc.*,
  (
    cvc.product_type_id IS NOT NULL
    AND jsonb_array_length(cvc.missing_required_variant_attributes)=0
    AND jsonb_array_length(cvc.missing_required_family_attributes)=0
    AND cvc.open_blocking_issue_count=0
  ) AS schema_publish_ready
FROM catalog_variant_schema_completeness cvc;

-- Preserve the observed multi-size source data as an explicit blocking normalization task.
INSERT INTO catalog_quality_issues(
  family_id,canonical_variant_id,issue_code,severity,status,details
)
SELECT
  cv.family_id,
  cv.id,
  'variant_matrix_unmaterialized',
  'blocking',
  'open',
  jsonb_build_object(
    'source_field','sizes_observed',
    'observed_sizes',cv.variant_attributes->'sizes_observed',
    'required_action','Create distinct canonical variants per sellable size and link vendor offers/stock to the correct variant.'
  )
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id
WHERE pt.code IN ('apparel','dress','shirt','top','footwear','running_shoe')
  AND jsonb_typeof(cv.variant_attributes->'sizes_observed')='array'
  AND jsonb_array_length(cv.variant_attributes->'sizes_observed') > 1
ON CONFLICT DO NOTHING;

ALTER TABLE catalog_quality_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON catalog_quality_issues
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

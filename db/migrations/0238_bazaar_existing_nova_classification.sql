-- 0238_bazaar_existing_nova_classification.sql
-- Reclassify already-linked NOVA second-life canonicals into the isolated BAZAAR
-- channel. Fail closed when one canonical has both normal and BAZAAR source
-- evidence: mixed identity must be split explicitly rather than moved in place.

DO $$
DECLARE
  mixed_count bigint;
BEGIN
  WITH evidence AS (
    SELECT
      l.canonical_variant_id,
      bls_private.catalog_nova_commerce_channel(p.normalized_payload) AS commerce_channel
    FROM public.catalog_source_product_links l
    JOIN public.catalog_source_products p ON p.id = l.source_product_id
  ), per_canonical AS (
    SELECT
      canonical_variant_id,
      bool_or(commerce_channel = 'bazaar') AS has_bazaar,
      bool_or(commerce_channel = 'normal') AS has_normal
    FROM evidence
    GROUP BY canonical_variant_id
  )
  SELECT count(*)
  INTO mixed_count
  FROM per_canonical
  WHERE has_bazaar AND has_normal;

  IF mixed_count > 0 THEN
    RAISE EXCEPTION
      'BAZAAR backfill blocked: % canonical variants have mixed normal/bazaar source evidence',
      mixed_count;
  END IF;
END;
$$;

WITH bazaar_evidence AS (
  SELECT
    l.canonical_variant_id,
    bool_or(
      lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload), ''))
        LIKE '%preloved%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload), ''))
        LIKE '%pre-loved%'
    ) AS has_preloved,
    bool_or(
      lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload), ''))
        LIKE '%preowned%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload), ''))
        LIKE '%pre-owned%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload), ''))
        LIKE '%defect%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload), ''))
        LIKE '%damaged%'
    ) AS has_defect
  FROM public.catalog_source_product_links l
  JOIN public.catalog_source_products p ON p.id = l.source_product_id
  WHERE bls_private.catalog_nova_commerce_channel(p.normalized_payload) = 'bazaar'
  GROUP BY l.canonical_variant_id
)
UPDATE public.canonical_variants cv
SET commerce_channel = 'bazaar',
    condition = CASE
      WHEN e.has_defect THEN 'preowned_defect'
      ELSE 'preloved'
    END,
    bazaar_source = CASE
      WHEN e.has_defect THEN 'supplier_preowned_defect'
      ELSE 'supplier_preloved'
    END,
    variant_attributes = COALESCE(cv.variant_attributes, '{}'::jsonb)
      || jsonb_build_object(
        'commerceChannel', 'bazaar',
        'supplierCondition', CASE
          WHEN e.has_defect THEN 'preowned_defect'
          ELSE 'preloved'
        END,
        'bazaarSource', CASE
          WHEN e.has_defect THEN 'supplier_preowned_defect'
          ELSE 'supplier_preloved'
        END,
        'bazaarBackfilledAtMigration', 238
      ),
    updated_at = now()
FROM bazaar_evidence e
WHERE cv.id = e.canonical_variant_id;

COMMENT ON COLUMN public.canonical_variants.bazaar_source IS
  'Optional provenance for BAZAAR inventory. Existing NOVA second-life canonicals were classified by migration 0238 only after a mixed-identity safety check.';

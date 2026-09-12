-- 0237_bazaar_existing_nova_classification.sql
-- Reclassify already-linked NOVA second-life canonicals into the isolated BAZAAR
-- channel. This migration deliberately fails closed if a canonical has evidence
-- from both normal and BAZAAR source products; mixed identities require an explicit
-- split rather than an automatic move.

DO $$
DECLARE
  mixed_count bigint;
BEGIN
  WITH classified AS (
    SELECT
      p.id,
      CASE
        WHEN lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%preloved%'
          OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%pre-loved%'
          THEN 'bazaar'
        WHEN lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%preowned%'
          OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%pre-owned%'
          OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%defect%'
          OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%damaged%'
          THEN 'bazaar'
        ELSE 'normal'
      END AS commerce_channel
    FROM public.catalog_source_products p
  ), per_canonical AS (
    SELECT
      l.canonical_variant_id,
      bool_or(c.commerce_channel='bazaar') AS has_bazaar,
      bool_or(c.commerce_channel='normal') AS has_normal
    FROM public.catalog_source_product_links l
    JOIN classified c ON c.id=l.source_product_id
    GROUP BY l.canonical_variant_id
  )
  SELECT count(*) INTO mixed_count
  FROM per_canonical
  WHERE has_bazaar AND has_normal;

  IF mixed_count > 0 THEN
    RAISE EXCEPTION 'BAZAAR backfill blocked: % canonical variants have mixed normal/bazaar source evidence', mixed_count;
  END IF;
END;
$$;

WITH classified_links AS (
  SELECT
    l.canonical_variant_id,
    bool_or(
      lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%preloved%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%pre-loved%'
    ) AS has_preloved,
    bool_or(
      lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%preowned%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%pre-owned%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%defect%'
      OR lower(COALESCE(bls_private.catalog_nova_condition_label(p.normalized_payload),'')) LIKE '%damaged%'
    ) AS has_defect
  FROM public.catalog_source_product_links l
  JOIN public.catalog_source_products p ON p.id=l.source_product_id
  GROUP BY l.canonical_variant_id
), targets AS (
  SELECT canonical_variant_id,has_preloved,has_defect
  FROM classified_links
  WHERE has_preloved OR has_defect
)
UPDATE public.canonical_variants cv
SET commerce_channel='bazaar',
    condition=CASE WHEN t.has_preloved THEN 'preloved' ELSE 'preowned_defect' END,
    bazaar_source=CASE WHEN t.has_preloved THEN 'supplier_preloved' ELSE 'supplier_preowned_defect' END,
    variant_attributes=COALESCE(cv.variant_attributes,'{}'::jsonb) || jsonb_build_object(
      'commerceChannel','bazaar',
      'supplierCondition',CASE WHEN t.has_preloved THEN 'preloved' ELSE 'preowned_defect' END,
      'bazaarSource',CASE WHEN t.has_preloved THEN 'supplier_preloved' ELSE 'supplier_preowned_defect' END
    ),
    updated_at=now()
FROM targets t
WHERE cv.id=t.canonical_variant_id;

COMMENT ON COLUMN public.canonical_variants.bazaar_source IS
  'Optional provenance for BAZAAR inventory. Existing NOVA Preloved and Preowned / Defect canonicals were backfilled by migration 0237 after a mixed-identity safety check.';

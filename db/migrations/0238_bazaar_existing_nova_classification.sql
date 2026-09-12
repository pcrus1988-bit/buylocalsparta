-- 0238_bazaar_existing_nova_classification.sql
-- Backfill already-linked NOVA/BrandsGateway second-life canonicals into BAZAAR.
-- Scope is deliberately restricted to the governed NOVA catalogue source.
-- If any target canonical also has normal-condition evidence from any catalogue
-- source, fail closed rather than silently moving a shared identity.

DO $$
DECLARE
  mixed_count bigint;
BEGIN
  WITH nova_sources AS (
    SELECT cs.id
    FROM public.catalog_sources cs
    WHERE cs.code = 'nova-brandsgateway'
  ),
  nova_bazaar_targets AS (
    SELECT DISTINCT l.canonical_variant_id
    FROM public.catalog_source_product_links l
    JOIN public.catalog_source_products p ON p.id = l.source_product_id
    WHERE p.source_id IN (SELECT id FROM nova_sources)
      AND bls_private.catalog_nova_commerce_channel(p.normalized_payload) = 'bazaar'
  ),
  all_evidence AS (
    SELECT
      l.canonical_variant_id,
      bool_or(bls_private.catalog_nova_commerce_channel(p.normalized_payload) = 'normal') AS has_normal
    FROM public.catalog_source_product_links l
    JOIN public.catalog_source_products p ON p.id = l.source_product_id
    WHERE l.canonical_variant_id IN (SELECT canonical_variant_id FROM nova_bazaar_targets)
    GROUP BY l.canonical_variant_id
  )
  SELECT count(*)
  INTO mixed_count
  FROM all_evidence
  WHERE has_normal;

  IF mixed_count > 0 THEN
    RAISE EXCEPTION
      'BAZAAR NOVA backfill blocked: % target canonical variants also have normal-condition source evidence',
      mixed_count;
  END IF;
END;
$$;

WITH nova_sources AS (
  SELECT cs.id
  FROM public.catalog_sources cs
  WHERE cs.code = 'nova-brandsgateway'
),
classified_links AS (
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
  JOIN public.catalog_source_products p ON p.id = l.source_product_id
  WHERE p.source_id IN (SELECT id FROM nova_sources)
  GROUP BY l.canonical_variant_id
),
targets AS (
  SELECT canonical_variant_id, has_preloved, has_defect
  FROM classified_links
  WHERE has_preloved OR has_defect
)
UPDATE public.canonical_variants cv
SET commerce_channel = 'bazaar',
    condition = CASE WHEN t.has_preloved THEN 'preloved' ELSE 'preowned_defect' END,
    bazaar_source = CASE WHEN t.has_preloved THEN 'supplier_preloved' ELSE 'supplier_preowned_defect' END,
    variant_attributes = COALESCE(cv.variant_attributes,'{}'::jsonb) || jsonb_build_object(
      'commerceChannel','bazaar',
      'supplierCondition',CASE WHEN t.has_preloved THEN 'preloved' ELSE 'preowned_defect' END,
      'bazaarSource',CASE WHEN t.has_preloved THEN 'supplier_preloved' ELSE 'supplier_preowned_defect' END
    ),
    updated_at = now()
FROM targets t
WHERE cv.id = t.canonical_variant_id;

COMMENT ON COLUMN public.canonical_variants.bazaar_source IS
  'Optional provenance for BAZAAR inventory. Existing linked NOVA/BrandsGateway second-life canonicals are backfilled only after a mixed-evidence safety check.';

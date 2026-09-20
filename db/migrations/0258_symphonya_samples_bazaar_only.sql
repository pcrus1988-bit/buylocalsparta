-- 0258_symphonya_samples_bazaar_only.sql
-- Symphonya products explicitly tagged "*Sample" are small-format sample stock.
-- They must never share the normal catalogue identity. Samples remain physically
-- classified as new unless other evidence says otherwise, but are sold only in
-- BAZAAR under supplier_sample provenance.

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_bazaar_source_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_bazaar_source_check
  CHECK (
    bazaar_source IS NULL
    OR bazaar_source IN (
      'supplier_preloved',
      'supplier_preowned_defect',
      'supplier_tester',
      'supplier_sample',
      'customer_return',
      'open_box',
      'display_stock',
      'damaged_packaging',
      'admin_curated'
    )
  );

COMMENT ON CONSTRAINT canonical_variants_bazaar_source_check
ON public.canonical_variants IS
  'Allows governed BAZAAR provenance including supplier tester and supplier sample inventory.';

ALTER TABLE public.canonical_variants
  DROP CONSTRAINT IF EXISTS canonical_variants_bazaar_not_new_check;

ALTER TABLE public.canonical_variants
  ADD CONSTRAINT canonical_variants_bazaar_not_new_check
  CHECK (
    commerce_channel <> 'bazaar'
    OR condition <> 'new'
    OR bazaar_source='supplier_sample'
  );

COMMENT ON CONSTRAINT canonical_variants_bazaar_not_new_check
ON public.canonical_variants IS
  'BAZAAR stock is not classified as new except explicit supplier_sample inventory, which is a new small-format sample rather than opened/used stock.';

CREATE TEMP TABLE _symphonya_sample_targets
ON COMMIT DROP
AS
SELECT DISTINCT
  cv.id AS old_canonical_id
FROM public.catalog_source_product_links link
JOIN public.catalog_source_products csp
  ON csp.id=link.source_product_id
JOIN public.catalog_sources source
  ON source.id=csp.source_id
 AND source.code='symphonya'
JOIN public.canonical_variants cv
  ON cv.id=link.canonical_variant_id
WHERE link.link_status='approved'
  AND csp.title ILIKE '%*Sample%'
  AND cv.commerce_channel='normal';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _symphonya_sample_targets target
    JOIN public.catalog_source_product_links other_link
      ON other_link.canonical_variant_id=target.old_canonical_id
     AND other_link.link_status='approved'
    JOIN public.catalog_source_products other_source_product
      ON other_source_product.id=other_link.source_product_id
    JOIN public.catalog_sources other_source
      ON other_source.id=other_source_product.source_id
    WHERE other_source.code IS DISTINCT FROM 'symphonya'
       OR other_source_product.title NOT ILIKE '%*Sample%'
  ) THEN
    RAISE EXCEPTION
      'Symphonya sample BAZAAR migration blocked: a sample canonical is shared with non-sample source evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _symphonya_sample_targets target
    JOIN public.vendor_offers other_offer
      ON other_offer.canonical_variant_id=target.old_canonical_id
    LEFT JOIN public.dropship_supplier_offers other_dso
      ON other_dso.vendor_offer_id=other_offer.id
    LEFT JOIN public.dropship_suppliers other_supplier
      ON other_supplier.id=other_dso.supplier_id
    LEFT JOIN public.catalog_source_products other_source
      ON other_source.id=other_dso.source_product_id
    WHERE other_supplier.code IS DISTINCT FROM 'symphonya'
       OR other_source.title IS NULL
       OR other_source.title NOT ILIKE '%*Sample%'
  ) THEN
    RAISE EXCEPTION
      'Symphonya sample BAZAAR migration blocked: a sample canonical is shared with non-sample or non-Symphonya offer evidence';
  END IF;
END;
$$;

CREATE TEMP TABLE _symphonya_sample_route (
  old_canonical_id uuid PRIMARY KEY,
  new_canonical_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO _symphonya_sample_route(old_canonical_id,new_canonical_id)
SELECT old_canonical_id,gen_random_uuid()
FROM _symphonya_sample_targets;

INSERT INTO public.canonical_variants(
  id,
  market_id,
  family_id,
  brand_id,
  category_id,
  slug,
  gtin,
  mpn,
  model,
  condition,
  variant_attributes,
  warranty_basis,
  platform_price_minor,
  currency,
  tax_rate_bps,
  active,
  suppressed,
  recalled,
  price_updated_at,
  created_at,
  updated_at,
  public_id,
  commerce_channel,
  bazaar_source
)
SELECT
  route.new_canonical_id,
  old.market_id,
  old.family_id,
  old.brand_id,
  old.category_id,
  old.slug,
  old.gtin,
  old.mpn,
  old.model,
  'new',
  COALESCE(old.variant_attributes,'{}'::jsonb)
    || jsonb_build_object(
      'commerceChannel','bazaar',
      'bazaarSource','supplier_sample',
      'supplierSample',true,
      'supplierCondition','sample',
      'sampleDisclosureVersion','1',
      'normalCanonicalPublicId',old.public_id
    ),
  old.warranty_basis,
  old.platform_price_minor,
  old.currency,
  old.tax_rate_bps,
  old.active,
  old.suppressed,
  old.recalled,
  old.price_updated_at,
  now(),
  now(),
  gen_random_uuid()::text,
  'bazaar',
  'supplier_sample'
FROM _symphonya_sample_route route
JOIN public.canonical_variants old
  ON old.id=route.old_canonical_id;

UPDATE public.product_translations row_to_move
SET canonical_variant_id=route.new_canonical_id
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.product_identifiers row_to_move
SET canonical_variant_id=route.new_canonical_id,
    updated_at=now()
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.product_media row_to_move
SET canonical_variant_id=route.new_canonical_id
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.product_color_profiles row_to_move
SET canonical_variant_id=route.new_canonical_id,
    updated_at=now()
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.canonical_variant_attribute_values row_to_move
SET canonical_variant_id=route.new_canonical_id,
    updated_at=now()
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.canonical_variant_category_assignments row_to_move
SET canonical_variant_id=route.new_canonical_id
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.product_tax_profiles row_to_move
SET canonical_variant_id=route.new_canonical_id
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.product_compliance_documents row_to_move
SET canonical_variant_id=route.new_canonical_id
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.catalog_quality_issues row_to_move
SET canonical_variant_id=route.new_canonical_id,
    updated_at=now()
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.vendor_product_submissions row_to_move
SET canonical_variant_id=route.new_canonical_id,
    updated_at=now()
FROM _symphonya_sample_route route
WHERE row_to_move.canonical_variant_id=route.old_canonical_id;

UPDATE public.catalog_source_product_links link
SET canonical_variant_id=route.new_canonical_id,
    updated_at=now()
FROM _symphonya_sample_route route
WHERE link.canonical_variant_id=route.old_canonical_id;

UPDATE public.vendor_offers offer
SET canonical_variant_id=route.new_canonical_id,
    source_payload=COALESCE(offer.source_payload,'{}'::jsonb)
      || jsonb_build_object(
        'commerceChannel','bazaar',
        'bazaarSource','supplier_sample',
        'supplierSample',true,
        'catalogueRouting','symphonya_sample_bazaar_v1'
      ),
    updated_at=now()
FROM _symphonya_sample_route route
WHERE offer.canonical_variant_id=route.old_canonical_id;

UPDATE public.canonical_variants old
SET active=false,
    gtin=NULL,
    mpn=NULL,
    variant_attributes=COALESCE(old.variant_attributes,'{}'::jsonb)
      || jsonb_build_object(
        'retiredReason','symphonya_sample_moved_to_bazaar',
        'bazaarSampleCanonicalPublicId',replacement.public_id
      ),
    updated_at=now()
FROM _symphonya_sample_route route
JOIN public.canonical_variants replacement
  ON replacement.id=route.new_canonical_id
WHERE old.id=route.old_canonical_id;

COMMENT ON COLUMN public.canonical_variants.bazaar_source IS
  'BAZAAR provenance. supplier_tester is opened tester stock; supplier_sample is small-format sample stock. Both are isolated from normal catalogue identity.';

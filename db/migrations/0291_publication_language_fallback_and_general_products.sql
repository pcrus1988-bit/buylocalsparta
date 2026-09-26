-- KONTA MOY publication-language policy and neutral fallback taxonomy for supplier catalogues.
-- Product publication must not depend on Greek localization. Source-language copy may
-- be served until optional localization/enrichment is available.

BEGIN;

INSERT INTO public.categories(
  market_id,parent_id,code,slug,commerce_mode,active,
  taxonomy_role,assignable,discoverable,checkout_fulfilment_modes,
  sort_order,updated_at
)
SELECT
  parent.market_id,
  parent.id,
  'general-products',
  'general-products',
  'standard',
  true,
  'product_class',
  true,
  true,
  ARRAY['shipping']::text[],
  999,
  now()
FROM public.categories parent
WHERE parent.code='specialist-retail'
  AND parent.active=true
  AND NOT EXISTS (
    SELECT 1
    FROM public.categories existing
    WHERE existing.market_id IS NOT DISTINCT FROM parent.market_id
      AND existing.code='general-products'
  );

INSERT INTO public.category_translations(category_id,locale,name,description)
SELECT c.id,v.locale,v.name,v.description
FROM public.categories c
CROSS JOIN (
  VALUES
    ('en'::text,'General products'::text,'Products awaiting a more specific catalogue classification.'::text),
    ('el'::text,'Λοιπά προϊόντα'::text,'Προϊόντα που αναμένουν ακριβέστερη κατηγοριοποίηση.'::text)
) v(locale,name,description)
WHERE c.code='general-products'
ON CONFLICT (category_id,locale) DO UPDATE
SET name=EXCLUDED.name,
    description=EXCLUDED.description;

-- Legacy source-quality metadata may still say that Greek localization is required.
-- That field is now informationally retired as a publication gate.
UPDATE public.catalog_source_products csp
SET quality_payload =
      (COALESCE(csp.quality_payload,'{}'::jsonb)
        || jsonb_build_object(
          'requiresGreekLocalization',false,
          'localizationRequiredForPublication',false,
          'sourceLanguageFallbackAllowed',true
        )),
    updated_at=now()
FROM public.catalog_sources cs
WHERE cs.id=csp.source_id
  AND COALESCE(csp.quality_payload->>'requiresGreekLocalization','false')='true';

COMMIT;

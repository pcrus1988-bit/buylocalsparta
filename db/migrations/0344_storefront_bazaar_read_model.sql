BEGIN;

CREATE MATERIALIZED VIEW public.storefront_bazaar_read_model AS
SELECT DISTINCT ON (cv.id)
  cv.id AS canonical_variant_id,
  cv.public_id AS canonical_public_id,
  cv.slug,
  COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
  COALESCE(el.description,en.description) AS description,
  c.code AS category_code,
  b.name AS brand_name,
  b.logo_object_key AS brand_logo_object_key,
  cv.condition,
  cv.bazaar_source,
  vo.customer_price_minor,
  vo.msrp_minor,
  CASE
    WHEN dso.id IS NOT NULL THEN GREATEST(COALESCE(dso.cached_quantity,0),0)
    ELSE GREATEST(
      0,
      COALESCE(ib.on_hand,0)
        - COALESCE(ib.active_reservations,0)
        - COALESCE(ib.safety_stock,0)
        - COALESCE(ib.blocked,0)
    )
  END AS available_to_sell,
  v.public_id AS vendor_public_id,
  v.trading_name AS vendor_name,
  (dso.id IS NOT NULL) AS supplier_fulfilled,
  dso.availability_expires_at AS available_until
FROM public.canonical_variants cv
JOIN public.categories c ON c.id=cv.category_id
LEFT JOIN public.brands b ON b.id=cv.brand_id
LEFT JOIN public.product_translations el
  ON el.canonical_variant_id=cv.id
 AND el.locale='el'
LEFT JOIN public.product_translations en
  ON en.canonical_variant_id=cv.id
 AND en.locale='en'
JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
JOIN public.vendor_businesses v
  ON v.id=vo.vendor_id
 AND v.status='active'
JOIN public.vendor_locations l
  ON l.id=vo.location_id
 AND l.active=true
LEFT JOIN public.dropship_supplier_offers dso
  ON dso.vendor_offer_id=vo.id
LEFT JOIN public.dropship_suppliers ds
  ON ds.id=dso.supplier_id
LEFT JOIN public.inventory_balances ib
  ON ib.offer_id=vo.id
WHERE cv.commerce_channel='bazaar'
  AND cv.active=true
  AND cv.suppressed=false
  AND cv.recalled=false
  AND vo.status='approved'
  AND vo.merchant_visible=true
  AND vo.merchant_pause_active=false
  AND vo.customer_price_minor>0
  AND (
    (
      dso.id IS NOT NULL
      AND dso.active=true
      AND ds.active=true
      AND ds.api_authoritative_availability=true
      AND dso.cached_available=true
      AND dso.cached_quantity>=1
      AND dso.availability_expires_at IS NOT NULL
      AND dso.availability_expires_at>now()
      AND (
        vo.cost_ceiling_minor IS NULL
        OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor
      )
    )
    OR (
      dso.id IS NULL
      AND GREATEST(
        0,
        COALESCE(ib.on_hand,0)
          - COALESCE(ib.active_reservations,0)
          - COALESCE(ib.safety_stock,0)
          - COALESCE(ib.blocked,0)
      )>0
    )
  )
ORDER BY
  cv.id,
  vo.customer_price_minor ASC,
  vo.updated_at DESC,
  vo.public_id;

CREATE UNIQUE INDEX storefront_bazaar_read_model_variant_uidx
  ON public.storefront_bazaar_read_model(canonical_variant_id);

CREATE INDEX storefront_bazaar_read_model_slug_idx
  ON public.storefront_bazaar_read_model(slug);

CREATE INDEX storefront_bazaar_read_model_public_id_idx
  ON public.storefront_bazaar_read_model(canonical_public_id);

CREATE INDEX storefront_bazaar_read_model_filters_idx
  ON public.storefront_bazaar_read_model(
    condition,
    bazaar_source,
    brand_name,
    category_code,
    canonical_variant_id
  );

REVOKE ALL ON TABLE public.storefront_bazaar_read_model FROM PUBLIC;
GRANT SELECT ON TABLE public.storefront_bazaar_read_model
  TO bls_app_runtime, bls_platform_runtime;

CREATE OR REPLACE FUNCTION bls_private.refresh_storefront_bazaar_read_model()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'bls_private'
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended('kontamou:storefront-bazaar-read-model-refresh',0)
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('lock_timeout','5000',true);
  PERFORM set_config('statement_timeout','60000',true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_bazaar_read_model';
END;
$$;

REVOKE ALL ON FUNCTION bls_private.refresh_storefront_bazaar_read_model() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.refresh_storefront_bazaar_read_model()
  TO bls_platform_runtime;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname='storefront-bazaar-read-model-refresh'
  ) THEN
    PERFORM cron.unschedule('storefront-bazaar-read-model-refresh');
  END IF;

  PERFORM cron.schedule(
    'storefront-bazaar-read-model-refresh',
    '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
    'SELECT bls_private.refresh_storefront_bazaar_read_model();'
  );
END;
$$;

COMMIT;

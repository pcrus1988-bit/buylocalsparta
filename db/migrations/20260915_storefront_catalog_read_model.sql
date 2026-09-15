-- Customer storefront read model.
--
-- The canonical catalogue remains the source of truth. This materialized view is
-- deliberately read-only and contains only the fields needed to discover a small
-- candidate window before the existing fairness / sticky-price / checkout paths
-- run. Heavy taxonomy, translation, offer, stock and dropship joins therefore move
-- out of customer request latency and into a background refresh.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_catalog_read_model AS
WITH RECURSIVE category_tree AS (
  SELECT c.id, c.parent_id, c.code, c.code AS department_code
  FROM public.categories c
  JOIN public.markets m ON m.id = c.market_id
  WHERE m.code = 'sparta'
    AND c.parent_id IS NULL

  UNION ALL

  SELECT child.id, child.parent_id, child.code, parent.department_code
  FROM public.categories child
  JOIN category_tree parent ON child.parent_id = parent.id
), eligible_offers AS (
  SELECT
    cv.id AS canonical_variant_id,
    cv.public_id AS canonical_public_id,
    cv.family_id,
    cv.category_id,
    cv.brand_id,
    cv.slug,
    cv.gtin,
    cv.mpn,
    cv.model,
    cv.variant_attributes,
    cv.created_at,
    cv.updated_at,
    c.code AS category_code,
    tree.department_code,
    vo.id AS vendor_offer_id,
    vo.vendor_id,
    vo.customer_price_minor,
    vo.msrp_minor,
    ib.offer_id IS NOT NULL
      AND dso.id IS NULL
      AND 'pickup'::fulfilment_mode = ANY(vo.fulfilment_modes)
      AND GREATEST(0, ib.on_hand - ib.active_reservations - ib.safety_stock - ib.blocked) >= 1
      AND ib.stock_confirmed_at IS NOT NULL
      AND ib.stock_confirmed_at + make_interval(secs => ib.freshness_ttl_seconds) > now()
      AS local_sellable,
    CASE
      WHEN ib.offer_id IS NOT NULL AND dso.id IS NULL
        THEN ib.stock_confirmed_at + make_interval(secs => ib.freshness_ttl_seconds)
      ELSE NULL
    END AS local_available_until,
    dso.id IS NOT NULL
      AND ds.active = true
      AND ds.api_authoritative_availability = true
      AND dso.active = true
      AND dso.cached_available = true
      AND (dso.cached_quantity IS NULL OR dso.cached_quantity >= 1)
      AND dso.availability_expires_at IS NOT NULL
      AND dso.availability_expires_at > now()
      AS dropship_sellable,
    CASE
      WHEN dso.id IS NOT NULL
        AND ds.active = true
        AND ds.api_authoritative_availability = true
        AND dso.active = true
        AND dso.cached_available = true
        AND (dso.cached_quantity IS NULL OR dso.cached_quantity >= 1)
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at > now()
        THEN dso.availability_expires_at
      ELSE NULL
    END AS dropship_available_until,
    dso.supplier_id AS dropship_supplier_id,
    dso.external_product_id AS dropship_external_product_id
  FROM public.canonical_variants cv
  JOIN public.markets m ON m.id = cv.market_id
  JOIN public.categories c ON c.id = cv.category_id
  JOIN category_tree tree ON tree.id = cv.category_id
  JOIN public.vendor_offers vo ON vo.canonical_variant_id = cv.id
  JOIN public.vendor_businesses v ON v.id = vo.vendor_id
  JOIN public.vendor_locations l ON l.id = vo.location_id
  LEFT JOIN public.inventory_balances ib ON ib.offer_id = vo.id
  LEFT JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id = vo.id
  LEFT JOIN public.dropship_suppliers ds ON ds.id = dso.supplier_id
  WHERE m.code = 'sparta'
    AND COALESCE(cv.commerce_channel, 'normal') = 'normal'
    AND cv.active = true
    AND cv.suppressed = false
    AND cv.recalled = false
    AND vo.status = 'approved'
    AND vo.merchant_visible = true
    AND vo.merchant_pause_active = false
    AND vo.customer_price_minor > 0
    AND v.status = 'active'
    AND l.active = true
    AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor <= vo.cost_ceiling_minor)
    AND bls_private.vendor_category_effectively_visible(vo.vendor_id, cv.category_id)
), aggregated AS (
  SELECT
    e.canonical_variant_id,
    e.canonical_public_id,
    e.family_id,
    e.category_id,
    e.brand_id,
    e.slug,
    e.gtin,
    e.mpn,
    e.model,
    e.variant_attributes,
    e.category_code,
    e.department_code,
    e.created_at,
    max(e.updated_at) AS source_updated_at,
    bool_or(e.local_sellable) AS local_sellable,
    max(e.local_available_until) FILTER (WHERE e.local_sellable) AS local_available_until,
    bool_or(e.dropship_sellable) AS dropship_sellable,
    max(e.dropship_available_until) FILTER (WHERE e.dropship_sellable) AS dropship_available_until,
    min(e.customer_price_minor) FILTER (WHERE e.local_sellable OR e.dropship_sellable) AS min_price_minor,
    max(e.msrp_minor) FILTER (WHERE e.local_sellable OR e.dropship_sellable) AS max_msrp_minor,
    count(DISTINCT e.vendor_offer_id) FILTER (WHERE e.local_sellable OR e.dropship_sellable)::integer AS eligible_offer_count,
    min(e.dropship_supplier_id::text) FILTER (WHERE e.dropship_sellable) AS dropship_supplier_id,
    min(e.dropship_external_product_id) FILTER (WHERE e.dropship_sellable) AS dropship_external_product_id
  FROM eligible_offers e
  GROUP BY
    e.canonical_variant_id,
    e.canonical_public_id,
    e.family_id,
    e.category_id,
    e.brand_id,
    e.slug,
    e.gtin,
    e.mpn,
    e.model,
    e.variant_attributes,
    e.category_code,
    e.department_code,
    e.created_at
)
SELECT
  a.canonical_variant_id,
  a.canonical_public_id,
  a.family_id,
  a.category_id,
  a.category_code,
  a.department_code,
  a.brand_id,
  b.name AS brand_name,
  b.logo_object_key AS brand_logo_object_key,
  a.slug,
  COALESCE(el.title, en.title, a.model, a.slug) AS title,
  COALESCE(el.description, en.description, '') AS description,
  a.gtin,
  a.mpn,
  lower(COALESCE(el.specifications->>'color', en.specifications->>'color', a.variant_attributes->>'color', '')) AS color,
  COALESCE(el.specifications->'sizes', en.specifications->'sizes', a.variant_attributes->'sizes_observed', '[]'::jsonb) AS sizes,
  lower(COALESCE(el.specifications->>'fit', en.specifications->>'fit', '')) AS fit,
  a.min_price_minor,
  a.max_msrp_minor,
  a.eligible_offer_count,
  a.local_sellable,
  a.local_available_until,
  a.dropship_sellable,
  a.dropship_available_until,
  a.dropship_supplier_id,
  a.dropship_external_product_id,
  a.created_at,
  a.source_updated_at,
  now() AS projected_at,
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      COALESCE(el.title, en.title, a.model, a.slug),
      COALESCE(el.description, en.description, ''),
      COALESCE(b.name, ''),
      COALESCE(a.gtin, ''),
      COALESCE(a.mpn, ''),
      a.category_code,
      a.department_code
    )
  ) AS search_vector
FROM aggregated a
LEFT JOIN public.product_families pf ON pf.id = a.family_id
LEFT JOIN public.brands b ON b.id = COALESCE(a.brand_id, pf.brand_id)
LEFT JOIN public.product_translations el
  ON el.canonical_variant_id = a.canonical_variant_id
 AND el.locale = 'el'
LEFT JOIN public.product_translations en
  ON en.canonical_variant_id = a.canonical_variant_id
 AND en.locale = 'en'
WHERE (a.local_sellable OR a.dropship_sellable)
  AND a.min_price_minor IS NOT NULL
  AND a.min_price_minor > 0;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_catalog_read_model_variant_uidx
  ON public.storefront_catalog_read_model (canonical_variant_id);

CREATE UNIQUE INDEX IF NOT EXISTS storefront_catalog_read_model_public_uidx
  ON public.storefront_catalog_read_model (canonical_public_id);

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_category_idx
  ON public.storefront_catalog_read_model (category_code, created_at DESC);

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_department_idx
  ON public.storefront_catalog_read_model (department_code, created_at DESC);

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_brand_idx
  ON public.storefront_catalog_read_model (lower(brand_name), created_at DESC)
  WHERE brand_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_price_idx
  ON public.storefront_catalog_read_model (min_price_minor, canonical_public_id);

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_dropship_family_idx
  ON public.storefront_catalog_read_model (dropship_supplier_id, dropship_external_product_id, created_at DESC)
  WHERE dropship_sellable = true;

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_search_gin_idx
  ON public.storefront_catalog_read_model USING gin (search_vector);

COMMENT ON MATERIALIZED VIEW public.storefront_catalog_read_model IS
  'Precomputed storefront discovery projection. Source-of-truth pricing, assignment, inventory and checkout remain in canonical/vendor offer tables.';

-- Refresh away from customer requests. Concurrent refresh keeps the previous
-- projection readable while PostgreSQL builds the next one.
SELECT cron.schedule(
  'refresh-storefront-catalog-read-model',
  '*/2 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model'
);

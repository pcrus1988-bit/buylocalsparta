-- Canonical reconciliation for storefront projection objects that were historically
-- applied through timestamped live migrations outside the four-digit application
-- migration ledger. Production already has these objects; CREATE ... IF NOT EXISTS
-- and named cron scheduling make this migration replay-safe there while ensuring a
-- fresh database receives the same read-model topology through the canonical chain.
--
-- Do not add new timestamped migrations after this point. Future schema changes must
-- use the numbered application migration sequence and checksum manifest.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Reconciled from historical live migration: 20260915_storefront_catalog_read_model.sql
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


-- Reconciled from historical live migration: 20260915_storefront_dropship_family_read_model.sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_family_read_model AS
WITH grouped AS (
  SELECT
    rm.dropship_supplier_id,
    rm.dropship_external_product_id,
    MAX(rm.dropship_available_until) AS available_until,
    MAX(rm.created_at) AS newest_at,
    MIN(rm.min_price_minor) AS min_price_minor,
    MAX(rm.max_msrp_minor) AS max_msrp_minor,
    COALESCE(array_agg(DISTINCT rm.category_code) FILTER (WHERE rm.category_code IS NOT NULL), '{}'::text[]) AS category_codes,
    COALESCE(array_agg(DISTINCT rm.department_code) FILTER (WHERE rm.department_code IS NOT NULL), '{}'::text[]) AS department_codes,
    COALESCE(array_agg(DISTINCT lower(rm.brand_name)) FILTER (WHERE rm.brand_name IS NOT NULL AND btrim(rm.brand_name)<>''), '{}'::text[]) AS brand_names,
    COALESCE(array_agg(DISTINCT rm.color) FILTER (WHERE rm.color IS NOT NULL AND rm.color<>''), '{}'::text[]) AS colors,
    COALESCE(array_agg(DISTINCT rm.fit) FILTER (WHERE rm.fit IS NOT NULL AND rm.fit<>''), '{}'::text[]) AS fits,
    string_agg(DISTINCT rm.sizes::text, ' ') AS sizes_text,
    to_tsvector('simple', string_agg(DISTINCT (
      rm.title || ' ' || coalesce(rm.brand_name,'') || ' ' || coalesce(rm.gtin,'') || ' ' ||
      coalesce(rm.mpn,'') || ' ' || rm.category_code
    ), ' ')) AS search_vector
  FROM public.storefront_catalog_read_model rm
  WHERE rm.dropship_sellable=true
    AND rm.dropship_available_until>now()
    AND rm.dropship_supplier_id IS NOT NULL
    AND rm.dropship_external_product_id IS NOT NULL
  GROUP BY rm.dropship_supplier_id, rm.dropship_external_product_id
)
SELECT g.*, count(*) over()::bigint AS total_families, now() AS projected_at
FROM grouped g;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_family_read_model_uidx
  ON public.storefront_dropship_family_read_model (dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_newest_idx
  ON public.storefront_dropship_family_read_model (newest_at DESC,dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_price_idx
  ON public.storefront_dropship_family_read_model (min_price_minor,dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_categories_gin
  ON public.storefront_dropship_family_read_model USING gin (category_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_departments_gin
  ON public.storefront_dropship_family_read_model USING gin (department_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_brands_gin
  ON public.storefront_dropship_family_read_model USING gin (brand_names);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_colors_gin
  ON public.storefront_dropship_family_read_model USING gin (colors);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_fits_gin
  ON public.storefront_dropship_family_read_model USING gin (fits);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_search_gin
  ON public.storefront_dropship_family_read_model USING gin (search_vector);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_read_model_sizes_trgm
  ON public.storefront_dropship_family_read_model USING gin (lower(coalesce(sizes_text,'')) gin_trgm_ops);



-- Reconciled from historical live migration: 20260915_storefront_filter_read_model.sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_filter_read_model AS
SELECT
  rm.canonical_variant_id,
  rm.canonical_public_id,
  rm.category_id,
  rm.category_code,
  rm.department_code,
  COALESCE(ctel.name,cten.name,rm.category_code) AS category_label,
  rm.brand_name,
  rm.color,
  rm.sizes,
  rm.fit,
  rm.gtin,
  rm.mpn,
  rm.min_price_minor,
  GREATEST(rm.local_available_until,rm.dropship_available_until) AS available_until,
  rm.search_vector,
  COALESCE(cv.variant_attributes,'{}'::jsonb)
    || COALESCE(en.specifications,'{}'::jsonb)
    || COALESCE(el.specifications,'{}'::jsonb) AS raw_attributes,
  now() AS projected_at
FROM public.storefront_catalog_read_model rm
JOIN public.canonical_variants cv ON cv.id=rm.canonical_variant_id
LEFT JOIN public.product_translations el ON el.canonical_variant_id=rm.canonical_variant_id AND el.locale='el'
LEFT JOIN public.product_translations en ON en.canonical_variant_id=rm.canonical_variant_id AND en.locale='en'
LEFT JOIN public.category_translations ctel ON ctel.category_id=rm.category_id AND ctel.locale='el'
LEFT JOIN public.category_translations cten ON cten.category_id=rm.category_id AND cten.locale='en';

CREATE UNIQUE INDEX IF NOT EXISTS storefront_filter_read_model_uidx
  ON public.storefront_filter_read_model(canonical_variant_id);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_category_idx
  ON public.storefront_filter_read_model(category_code);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_department_idx
  ON public.storefront_filter_read_model(department_code);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_brand_idx
  ON public.storefront_filter_read_model(lower(brand_name)) WHERE brand_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_color_idx
  ON public.storefront_filter_read_model(color) WHERE color IS NOT NULL AND color<>'';
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_sizes_gin
  ON public.storefront_filter_read_model USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_search_gin
  ON public.storefront_filter_read_model USING gin(search_vector);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_raw_attributes_gin
  ON public.storefront_filter_read_model USING gin(raw_attributes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS storefront_filter_read_model_available_idx
  ON public.storefront_filter_read_model(available_until);

-- Stagger dependent projections so refresh work cannot pile up on the same minute.


-- Reconciled from historical live migration: 20260915_storefront_facet_read_model.sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_facet_read_model AS
SELECT
  rm.canonical_variant_id,
  rm.category_code,
  rm.department_code,
  COALESCE(ctel.name,cten.name,rm.category_code) AS category_label,
  rm.brand_name,
  rm.color,
  CASE WHEN jsonb_typeof(rm.sizes)='array' THEN rm.sizes ELSE '[]'::jsonb END AS sizes,
  rm.fit,
  rm.gtin,
  rm.mpn,
  rm.min_price_minor,
  GREATEST(rm.local_available_until,rm.dropship_available_until) AS available_until,
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      rm.title,
      COALESCE(rm.brand_name,''),
      COALESCE(rm.gtin,''),
      COALESCE(rm.mpn,''),
      rm.category_code,
      rm.department_code
    )
  ) AS search_vector,
  now() AS projected_at
FROM public.storefront_catalog_read_model rm
LEFT JOIN public.category_translations ctel ON ctel.category_id=rm.category_id AND ctel.locale='el'
LEFT JOIN public.category_translations cten ON cten.category_id=rm.category_id AND cten.locale='en';

CREATE UNIQUE INDEX IF NOT EXISTS storefront_facet_read_model_uidx
  ON public.storefront_facet_read_model(canonical_variant_id);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_category_idx
  ON public.storefront_facet_read_model(category_code);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_department_idx
  ON public.storefront_facet_read_model(department_code);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_brand_idx
  ON public.storefront_facet_read_model(lower(brand_name)) WHERE brand_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_color_idx
  ON public.storefront_facet_read_model(color) WHERE color IS NOT NULL AND color<>'';
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_sizes_gin
  ON public.storefront_facet_read_model USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_fit_idx
  ON public.storefront_facet_read_model(fit) WHERE fit IS NOT NULL AND fit<>'';
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_search_gin
  ON public.storefront_facet_read_model USING gin(search_vector);
CREATE INDEX IF NOT EXISTS storefront_facet_read_model_available_idx
  ON public.storefront_facet_read_model(available_until);

-- Stagger refresh work: public discovery can be five minutes stale without
-- compromising checkout because requests still enforce availability expiry and
-- checkout revalidates authoritative stock/pricing.


-- Reconciled from historical live migration: 20260915_storefront_dropship_family_filter_read_model.sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_family_filter_read_model AS
WITH variant_facts AS (
  SELECT
    rm.dropship_supplier_id,
    rm.dropship_external_product_id,
    rm.category_code,
    rm.department_code,
    rm.brand_name,
    NULLIF(BTRIM(COALESCE(NULLIF(rm.color,''),cv.variant_attributes->>'color','')),'') AS color,
    rm.min_price_minor,
    rm.max_msrp_minor,
    rm.created_at,
    rm.dropship_available_until AS available_until,
    rm.title,
    rm.gtin,
    rm.mpn,
    NULLIF(BTRIM(size_entry.value),'') AS size_value
  FROM public.storefront_catalog_read_model rm
  JOIN public.canonical_variants cv ON cv.id=rm.canonical_variant_id
  LEFT JOIN LATERAL unnest(ARRAY[
    cv.variant_attributes->>'italian_size_men',
    cv.variant_attributes->>'italian_size_women',
    cv.variant_attributes->>'shoe_size_women',
    cv.variant_attributes->>'shoe_size_men',
    cv.variant_attributes->>'waist_size',
    cv.variant_attributes->>'belt_size',
    cv.variant_attributes->>'waist_length_size',
    cv.variant_attributes->>'hat_size',
    cv.variant_attributes->>'swimwear_sleepwear_size',
    cv.variant_attributes->>'shoe_size',
    cv.variant_attributes->>'earrings_size',
    cv.variant_attributes->>'bracelets_size',
    cv.variant_attributes->>'gloves_size_women',
    cv.variant_attributes->>'ring_size',
    cv.variant_attributes->>'gloves_size_men',
    cv.variant_attributes->>'size'
  ]) AS size_entry(value) ON true
  WHERE rm.dropship_sellable=true
    AND rm.dropship_available_until>now()
    AND rm.dropship_supplier_id IS NOT NULL
    AND rm.dropship_external_product_id IS NOT NULL
), grouped AS (
  SELECT
    dropship_supplier_id,
    dropship_external_product_id,
    MAX(available_until) AS available_until,
    MAX(created_at) AS newest_at,
    MIN(min_price_minor) AS min_price_minor,
    MAX(max_msrp_minor) AS max_msrp_minor,
    COALESCE(array_agg(DISTINCT category_code) FILTER (WHERE category_code IS NOT NULL),'{}'::text[]) AS category_codes,
    COALESCE(array_agg(DISTINCT department_code) FILTER (WHERE department_code IS NOT NULL),'{}'::text[]) AS department_codes,
    COALESCE(array_agg(DISTINCT brand_name) FILTER (WHERE brand_name IS NOT NULL AND btrim(brand_name)<>''),'{}'::text[]) AS brand_names,
    COALESCE(array_agg(DISTINCT lower(brand_name)) FILTER (WHERE brand_name IS NOT NULL AND btrim(brand_name)<>''),'{}'::text[]) AS brand_names_normalized,
    COALESCE(array_agg(DISTINCT color) FILTER (WHERE color IS NOT NULL AND btrim(color)<>''),'{}'::text[]) AS colors,
    COALESCE(array_agg(DISTINCT size_value) FILTER (WHERE size_value IS NOT NULL),'{}'::text[]) AS sizes,
    to_tsvector('simple',string_agg(DISTINCT (
      title || ' ' || COALESCE(brand_name,'') || ' ' || COALESCE(gtin,'') || ' ' ||
      COALESCE(mpn,'') || ' ' || category_code
    ),' ')) AS search_vector
  FROM variant_facts
  GROUP BY dropship_supplier_id,dropship_external_product_id
)
SELECT grouped.*,COUNT(*) OVER()::bigint AS total_families,now() AS projected_at
FROM grouped;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_family_filter_uidx
  ON public.storefront_dropship_family_filter_read_model(dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_supplier_newest_idx
  ON public.storefront_dropship_family_filter_read_model(dropship_supplier_id,newest_at DESC,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_supplier_price_idx
  ON public.storefront_dropship_family_filter_read_model(dropship_supplier_id,min_price_minor,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_categories_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(category_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_departments_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(department_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_brands_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(brand_names_normalized);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_colors_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(colors);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_sizes_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_search_gin
  ON public.storefront_dropship_family_filter_read_model USING gin(search_vector);



-- Reconciled from historical live migration: 20260915_storefront_dropship_vendor_facets.sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_vendor_facets AS
WITH base AS (
  SELECT *
  FROM public.storefront_dropship_family_filter_read_model
  WHERE available_until>now()
), totals AS (
  SELECT dropship_supplier_id AS supplier_id,'total'::text AS facet_type,'*'::text AS value,'*'::text AS label,COUNT(*)::int AS count
  FROM base GROUP BY dropship_supplier_id
), category_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'category'::text AS facet_type,category_code.value AS value,
         COALESCE(ctel.name,cten.name,category_code.value) AS label,COUNT(*)::int AS count
  FROM base b
  CROSS JOIN LATERAL unnest(b.category_codes) AS category_code(value)
  LEFT JOIN public.markets m ON m.code='sparta'
  LEFT JOIN public.categories c ON c.market_id=m.id AND c.code=category_code.value
  LEFT JOIN public.category_translations ctel ON ctel.category_id=c.id AND ctel.locale='el'
  LEFT JOIN public.category_translations cten ON cten.category_id=c.id AND cten.locale='en'
  GROUP BY b.dropship_supplier_id,category_code.value,COALESCE(ctel.name,cten.name,category_code.value)
), brand_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'brand'::text AS facet_type,brand.value AS value,brand.value AS label,COUNT(*)::int AS count
  FROM base b CROSS JOIN LATERAL unnest(b.brand_names) AS brand(value)
  GROUP BY b.dropship_supplier_id,brand.value
), color_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'color'::text AS facet_type,color.value AS value,color.value AS label,COUNT(*)::int AS count
  FROM base b CROSS JOIN LATERAL unnest(b.colors) AS color(value)
  GROUP BY b.dropship_supplier_id,color.value
), size_values AS (
  SELECT b.dropship_supplier_id AS supplier_id,'size'::text AS facet_type,size_value.value AS value,size_value.value AS label,COUNT(*)::int AS count
  FROM base b CROSS JOIN LATERAL unnest(b.sizes) AS size_value(value)
  GROUP BY b.dropship_supplier_id,size_value.value
)
SELECT * FROM totals
UNION ALL SELECT * FROM category_values
UNION ALL SELECT * FROM brand_values
UNION ALL SELECT * FROM color_values
UNION ALL SELECT * FROM size_values;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_vendor_facets_uidx
  ON public.storefront_dropship_vendor_facets(supplier_id,facet_type,value,label);
CREATE INDEX IF NOT EXISTS storefront_dropship_vendor_facets_lookup_idx
  ON public.storefront_dropship_vendor_facets(supplier_id,facet_type,label,value);



-- Reconciled from historical live migration: 20260915_storefront_vendor_assortment_read_model.sql
-- Preaggregate public vendor assortment metadata used by vendor profile and /shops.
-- Large dropship vendors can own tens of thousands of offers; counting them during
-- a storefront request is both unnecessary and a source of statement timeouts.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_vendor_assortment_read_model AS
SELECT
  v.id AS vendor_id,
  v.public_id AS vendor_public_id,
  COALESCE(array_agg(DISTINCT c.code ORDER BY c.code), ARRAY[]::text[]) AS category_codes,
  count(DISTINCT cv.id)::integer AS canonical_count,
  now() AS projected_at
FROM public.vendor_businesses v
JOIN public.vendor_offers vo ON vo.vendor_id=v.id
JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
JOIN public.categories c ON c.id=cv.category_id
JOIN public.vendor_locations offer_location ON offer_location.id=vo.location_id
WHERE v.status='active'
  AND vo.status='approved'
  AND offer_location.active=true
  AND cv.active=true
  AND cv.suppressed=false
  AND cv.recalled=false
GROUP BY v.id,v.public_id;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_vendor_assortment_vendor_uidx
  ON public.storefront_vendor_assortment_read_model(vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_vendor_assortment_public_uidx
  ON public.storefront_vendor_assortment_read_model(vendor_public_id);

-- Run last in the hourly storefront projection pipeline. Public vendor assortment
-- metadata may be up to roughly one hour stale; transactional availability and
-- checkout remain independent and authoritative.

-- Reconciled from historical live migration: 20261001_admin_storefront_media_blob_fallback.sql
-- Emergency fallback for Admin storefront media when the external object-storage
-- pipeline is unavailable. Bytes remain in the private schema and are never exposed
-- directly; all reads continue through authenticated/admin or governed public routes.
CREATE TABLE IF NOT EXISTS bls_private.vendor_storefront_media_blobs (
  media_id uuid PRIMARY KEY REFERENCES public.product_media(id) ON DELETE CASCADE,
  image_bytes bytea NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 3500000),
  sha256 character(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  validation_method text NOT NULL DEFAULT 'magic-bytes-v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE bls_private.vendor_storefront_media_blobs FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE bls_private.vendor_storefront_media_blobs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE bls_private.vendor_storefront_media_blobs FROM authenticated';
  END IF;
END $$;

COMMENT ON TABLE bls_private.vendor_storefront_media_blobs IS
  'Private emergency storage for Admin vendor storefront images when the S3 media pipeline is unavailable.';

-- Reconciled from historical live migration: 20260917_storefront_dropship_rich_filter_facets.sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.storefront_dropship_family_filter_read_model_v2 AS
WITH latest_source_product AS (
  SELECT DISTINCT ON (csp.source_id,csp.source_product_key)
    csp.source_id,
    csp.source_product_key,
    csp.title,
    csp.raw_payload
  FROM public.catalog_source_products csp
  JOIN public.dropship_suppliers ds
    ON ds.catalog_source_id=csp.source_id
   AND ds.active=true
  ORDER BY csp.source_id,csp.source_product_key,csp.created_at DESC,csp.id DESC
), source_attribute_values AS (
  SELECT
    lsp.source_id,
    lsp.source_product_key,
    lower(trim(both ':' from btrim(coalesce(attribute.value->>'name','')))) AS attribute_name,
    btrim(option_value.value) AS option_value
  FROM latest_source_product lsp
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(lsp.raw_payload->'attributes')='array' THEN lsp.raw_payload->'attributes'
      ELSE '[]'::jsonb
    END
  ) attribute(value)
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(attribute.value->'options')='array' THEN attribute.value->'options'
      WHEN jsonb_typeof(attribute.value->'options')='string' THEN jsonb_build_array(attribute.value->'options')
      ELSE '[]'::jsonb
    END
  ) option_value(value)
  WHERE btrim(option_value.value)<>''
), source_colors AS (
  SELECT source_id,source_product_key,
    array_agg(DISTINCT option_value ORDER BY option_value) AS colors
  FROM source_attribute_values
  WHERE attribute_name IN ('color','colour','colors','colours')
  GROUP BY source_id,source_product_key
), source_material_tags AS (
  SELECT DISTINCT
    sav.source_id,
    sav.source_product_key,
    material.tag
  FROM source_attribute_values sav
  CROSS JOIN LATERAL (VALUES
    ('cotton','cotton'),
    ('wool','wool'),
    ('cashmere','cashmere'),
    ('silk','silk'),
    ('linen','linen'),
    ('polyester','polyester'),
    ('viscose','viscose'),
    ('rayon','rayon'),
    ('acrylic','acrylic'),
    ('polyamide','polyamide'),
    ('nylon','nylon'),
    ('elastane','elastane'),
    ('spandex','elastane'),
    ('leather','leather'),
    ('suede','suede'),
    ('denim','denim'),
    ('modal','modal'),
    ('lyocell','lyocell'),
    ('tencel','lyocell'),
    ('acetate','acetate'),
    ('polyurethane','polyurethane'),
    ('rubber','rubber')
  ) AS material(needle,tag)
  WHERE sav.attribute_name IN ('material','materials')
    AND lower(sav.option_value) LIKE '%' || material.needle || '%'
), source_materials AS (
  SELECT source_id,source_product_key,
    array_agg(DISTINCT tag ORDER BY tag) AS materials
  FROM source_material_tags
  GROUP BY source_id,source_product_key
), source_explicit_fits AS (
  SELECT source_id,source_product_key,
    array_agg(DISTINCT lower(option_value) ORDER BY lower(option_value)) AS fits
  FROM source_attribute_values
  WHERE attribute_name IN ('fit','fitting')
  GROUP BY source_id,source_product_key
), source_title_fits AS (
  SELECT
    lsp.source_id,
    lsp.source_product_key,
    array_remove(ARRAY[
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])slim( fit)?([^a-z]|$)' THEN 'slim' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])regular( fit)?([^a-z]|$)' THEN 'regular' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])relaxed( fit)?([^a-z]|$)' THEN 'relaxed' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])oversized([^a-z]|$)' THEN 'oversized' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])skinny( fit)?([^a-z]|$)' THEN 'skinny' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])straight( fit)?([^a-z]|$)' THEN 'straight' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])loose( fit)?([^a-z]|$)' THEN 'loose' END,
      CASE WHEN lower(coalesce(lsp.title,'')) ~ '(^|[^a-z])tapered( fit)?([^a-z]|$)' THEN 'tapered' END
    ]::text[],NULL) AS fits
  FROM latest_source_product lsp
), enriched AS (
  SELECT
    fm.*,
    coalesce(lsp.title,'') AS sort_title,
    COALESCE((
      SELECT array_agg(DISTINCT value ORDER BY value)
      FROM unnest(coalesce(fm.colors,'{}'::text[]) || coalesce(sc.colors,'{}'::text[])) AS merged(value)
      WHERE btrim(value)<>''
    ),'{}'::text[]) AS enriched_colors,
    COALESCE((
      SELECT array_agg(DISTINCT value ORDER BY value)
      FROM unnest(
        coalesce(fr.fits,'{}'::text[])
        || coalesce(sef.fits,'{}'::text[])
        || coalesce(stf.fits,'{}'::text[])
      ) AS merged(value)
      WHERE btrim(value)<>''
    ),'{}'::text[]) AS enriched_fits,
    coalesce(sm.materials,'{}'::text[]) AS materials
  FROM public.storefront_dropship_family_filter_read_model fm
  JOIN public.dropship_suppliers ds
    ON ds.id::text=fm.dropship_supplier_id
  LEFT JOIN latest_source_product lsp
    ON lsp.source_id=ds.catalog_source_id
   AND lsp.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_colors sc
    ON sc.source_id=ds.catalog_source_id
   AND sc.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_materials sm
    ON sm.source_id=ds.catalog_source_id
   AND sm.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_explicit_fits sef
    ON sef.source_id=ds.catalog_source_id
   AND sef.source_product_key=fm.dropship_external_product_id
  LEFT JOIN source_title_fits stf
    ON stf.source_id=ds.catalog_source_id
   AND stf.source_product_key=fm.dropship_external_product_id
  LEFT JOIN public.storefront_dropship_family_read_model fr
    ON fr.dropship_supplier_id=fm.dropship_supplier_id
   AND fr.dropship_external_product_id=fm.dropship_external_product_id
)
SELECT
  dropship_supplier_id,
  dropship_external_product_id,
  available_until,
  newest_at,
  min_price_minor,
  max_msrp_minor,
  category_codes,
  department_codes,
  brand_names,
  brand_names_normalized,
  enriched_colors AS colors,
  sizes,
  enriched_fits AS fits,
  materials,
  sort_title,
  search_vector,
  total_families,
  projected_at
FROM enriched;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_uidx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_supplier_newest_idx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,newest_at DESC,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_supplier_price_idx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,min_price_minor,dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_supplier_title_idx
  ON public.storefront_dropship_family_filter_read_model_v2(dropship_supplier_id,lower(sort_title),dropship_external_product_id);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_categories_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(category_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_brands_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(brand_names_normalized);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_colors_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(colors);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_sizes_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_fits_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(fits);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_materials_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(materials);
CREATE INDEX IF NOT EXISTS storefront_dropship_family_filter_v2_search_gin
  ON public.storefront_dropship_family_filter_read_model_v2 USING gin(search_vector);

-- Reconciled from historical live migration: 20260920202509_nova_availability_burst_and_projection_refresh.sql
CREATE OR REPLACE FUNCTION bls_private.refresh_storefront_projection_after_nova(
  p_trigger text DEFAULT 'nova_cycle'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_cycle_at timestamptz;
  v_last_cycle_at timestamptz;
  v_last_refreshed_at timestamptz;
  v_started_at timestamptz := clock_timestamp();
BEGIN
  IF p_trigger NOT IN ('nova_cycle', 'fallback') THEN
    RAISE EXCEPTION 'unsupported storefront projection refresh trigger: %', p_trigger;
  END IF;

  SELECT
    NULLIF(metadata #>> '{novaAvailabilityFailover,lastCompletedAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastNovaCycleAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastRefreshedAt}', '')::timestamptz
  INTO v_cycle_at, v_last_cycle_at, v_last_refreshed_at
  FROM public.catalog_sources
  WHERE code='nova-brandsgateway'
  LIMIT 1;

  IF p_trigger='nova_cycle' THEN
    IF v_cycle_at IS NULL OR (v_last_cycle_at IS NOT NULL AND v_cycle_at <= v_last_cycle_at) THEN
      RETURN;
    END IF;
  ELSE
    IF v_last_refreshed_at IS NOT NULL
       AND v_last_refreshed_at > now() - interval '55 minutes' THEN
      RETURN;
    END IF;
  END IF;

  -- Do not allow the reactive and fallback pipelines to compete for DB I/O.
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended('kontamou:storefront-projection-refresh', 0)
  ) THEN
    RETURN;
  END IF;

  -- Re-check after obtaining the lock in case another invocation completed
  -- immediately before this one.
  SELECT
    NULLIF(metadata #>> '{novaAvailabilityFailover,lastCompletedAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastNovaCycleAt}', '')::timestamptz,
    NULLIF(metadata #>> '{storefrontProjectionRefresh,lastRefreshedAt}', '')::timestamptz
  INTO v_cycle_at, v_last_cycle_at, v_last_refreshed_at
  FROM public.catalog_sources
  WHERE code='nova-brandsgateway'
  LIMIT 1;

  IF p_trigger='nova_cycle' THEN
    IF v_cycle_at IS NULL OR (v_last_cycle_at IS NOT NULL AND v_cycle_at <= v_last_cycle_at) THEN
      RETURN;
    END IF;
  ELSE
    IF v_last_refreshed_at IS NOT NULL
       AND v_last_refreshed_at > now() - interval '55 minutes' THEN
      RETURN;
    END IF;
  END IF;

  PERFORM set_config('lock_timeout', '30000', true);

  PERFORM set_config('statement_timeout', '480000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model';

  PERFORM set_config('statement_timeout', '480000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model';

  PERFORM set_config('statement_timeout', '360000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model';

  PERFORM set_config('statement_timeout', '360000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model_v2';

  PERFORM set_config('statement_timeout', '120000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_vendor_facets';

  PERFORM set_config('statement_timeout', '240000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_facet_read_model';

  PERFORM set_config('statement_timeout', '480000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model';

  PERFORM set_config('statement_timeout', '240000', true);
  EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_vendor_assortment_read_model';

  UPDATE public.catalog_sources
  SET metadata=jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{storefrontProjectionRefresh}',
        COALESCE(metadata->'storefrontProjectionRefresh', '{}'::jsonb)
          || jsonb_build_object(
            'lastRefreshedAt', clock_timestamp(),
            'lastNovaCycleAt', v_cycle_at,
            'lastTrigger', p_trigger,
            'durationMs',
              round(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)
          ),
        true
      ),
      updated_at=now()
  WHERE code='nova-brandsgateway';
END
$function$;

REVOKE ALL
ON FUNCTION bls_private.refresh_storefront_projection_after_nova(text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION bls_private.refresh_storefront_projection_after_nova(text)
TO postgres;

-- Reconciled from historical live migration: 20260920205125_nova_live_storefront_incremental_projection.sql
-- Incremental Nova/BrandsGateway storefront availability projection.
--
-- Availability remains supplier-authoritative and expires on the existing offer TTL.
-- This compact private table is updated for only the supplier product IDs touched by
-- each availability batch. Fresh unavailable evidence is represented by a tombstone
-- row so an older materialized-view row cannot leak back into the storefront.

CREATE TABLE IF NOT EXISTS bls_private.storefront_dropship_live_family (
  supplier_id uuid NOT NULL,
  external_product_id text NOT NULL,
  sellable boolean NOT NULL DEFAULT false,
  available_until timestamptz NOT NULL,
  newest_at timestamptz NOT NULL DEFAULT now(),
  min_price_minor bigint,
  max_msrp_minor bigint,
  category_codes text[] NOT NULL DEFAULT '{}'::text[],
  department_codes text[] NOT NULL DEFAULT '{}'::text[],
  brand_names text[] NOT NULL DEFAULT '{}'::text[],
  brand_names_normalized text[] NOT NULL DEFAULT '{}'::text[],
  colors text[] NOT NULL DEFAULT '{}'::text[],
  sizes text[] NOT NULL DEFAULT '{}'::text[],
  sizes_text text NOT NULL DEFAULT '[]',
  fits text[] NOT NULL DEFAULT '{}'::text[],
  materials text[] NOT NULL DEFAULT '{}'::text[],
  sort_title text NOT NULL DEFAULT '',
  search_vector tsvector NOT NULL DEFAULT ''::tsvector,
  projected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, external_product_id)
);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_available_idx
  ON bls_private.storefront_dropship_live_family
  (supplier_id, sellable, available_until DESC, newest_at DESC, external_product_id);

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_price_idx
  ON bls_private.storefront_dropship_live_family
  (supplier_id, min_price_minor, external_product_id)
  WHERE sellable=true;

CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_categories_gin
  ON bls_private.storefront_dropship_live_family USING gin(category_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_departments_gin
  ON bls_private.storefront_dropship_live_family USING gin(department_codes);
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_brands_gin
  ON bls_private.storefront_dropship_live_family USING gin(brand_names_normalized);
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_colors_gin
  ON bls_private.storefront_dropship_live_family USING gin(colors);
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_sizes_gin
  ON bls_private.storefront_dropship_live_family USING gin(sizes);
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_fits_gin
  ON bls_private.storefront_dropship_live_family USING gin(fits);
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_materials_gin
  ON bls_private.storefront_dropship_live_family USING gin(materials);
CREATE INDEX IF NOT EXISTS storefront_dropship_live_family_search_gin
  ON bls_private.storefront_dropship_live_family USING gin(search_vector);

REVOKE ALL ON bls_private.storefront_dropship_live_family FROM PUBLIC;

CREATE OR REPLACE FUNCTION bls_private.refresh_nova_storefront_live_families(
  p_external_product_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $function$
DECLARE
  v_supplier_id uuid;
  v_catalog_source_id uuid;
  v_projected integer := 0;
BEGIN
  IF COALESCE(cardinality(p_external_product_ids),0)=0 THEN
    RETURN 0;
  END IF;

  SELECT ds.id,ds.catalog_source_id
  INTO v_supplier_id,v_catalog_source_id
  FROM public.dropship_suppliers ds
  WHERE ds.code='nova_brandsgateway'
    AND ds.active=true
    AND ds.api_authoritative_availability=true
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM bls_private.storefront_dropship_live_family lf
  WHERE lf.supplier_id=v_supplier_id
    AND lf.external_product_id=ANY(p_external_product_ids);

  INSERT INTO bls_private.storefront_dropship_live_family (
    supplier_id,external_product_id,sellable,available_until,newest_at,projected_at
  )
  SELECT
    v_supplier_id,
    ids.external_product_id,
    false,
    MAX(dso.availability_expires_at),
    MAX(dso.updated_at),
    clock_timestamp()
  FROM (
    SELECT DISTINCT value AS external_product_id
    FROM unnest(p_external_product_ids) value
    WHERE value IS NOT NULL AND btrim(value)<>''
  ) ids
  JOIN public.dropship_supplier_offers dso
    ON dso.supplier_id=v_supplier_id
   AND dso.external_product_id=ids.external_product_id
   AND dso.active=true
   AND dso.availability_expires_at IS NOT NULL
   AND dso.availability_expires_at>now()
  GROUP BY ids.external_product_id;

  WITH RECURSIVE
  ids AS MATERIALIZED (
    SELECT DISTINCT value AS external_product_id
    FROM unnest(p_external_product_ids) value
    WHERE value IS NOT NULL AND btrim(value)<>''
  ),
  category_tree AS MATERIALIZED (
    SELECT c.id,c.parent_id,c.code,c.code AS department_code
    FROM public.categories c
    JOIN public.markets m ON m.id=c.market_id
    WHERE m.code='sparta' AND c.parent_id IS NULL
    UNION ALL
    SELECT child.id,child.parent_id,child.code,parent.department_code
    FROM public.categories child
    JOIN category_tree parent ON child.parent_id=parent.id
  ),
  latest_source_product AS MATERIALIZED (
    SELECT DISTINCT ON (csp.source_product_key)
      csp.source_product_key,csp.title,csp.raw_payload
    FROM public.catalog_source_products csp
    JOIN ids ON ids.external_product_id=csp.source_product_key
    WHERE csp.source_id=v_catalog_source_id
    ORDER BY csp.source_product_key,csp.created_at DESC,csp.id DESC
  ),
  source_attribute_values AS MATERIALIZED (
    SELECT
      lsp.source_product_key,
      lower(trim(both ':' from btrim(COALESCE(attribute.value->>'name','')))) AS attribute_name,
      btrim(option_value.value) AS option_value
    FROM latest_source_product lsp
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(lsp.raw_payload->'attributes')='array'
        THEN lsp.raw_payload->'attributes'
        ELSE '[]'::jsonb
      END
    ) attribute(value)
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(attribute.value->'options')='array'
        THEN attribute.value->'options'
        WHEN jsonb_typeof(attribute.value->'options')='string'
        THEN jsonb_build_array(attribute.value->'options')
        ELSE '[]'::jsonb
      END
    ) option_value(value)
    WHERE btrim(option_value.value)<>''
  ),
  source_colors AS (
    SELECT source_product_key,
           array_agg(DISTINCT lower(option_value) ORDER BY lower(option_value)) AS colors
    FROM source_attribute_values
    WHERE attribute_name IN ('color','colour','colors','colours')
    GROUP BY source_product_key
  ),
  source_sizes AS (
    SELECT source_product_key,
           array_agg(DISTINCT option_value ORDER BY option_value) AS sizes
    FROM source_attribute_values
    WHERE attribute_name IN ('size','sizes')
    GROUP BY source_product_key
  ),
  source_material_tags AS (
    SELECT DISTINCT sav.source_product_key,material.tag
    FROM source_attribute_values sav
    CROSS JOIN LATERAL (VALUES
      ('cotton','cotton'),('wool','wool'),('cashmere','cashmere'),
      ('silk','silk'),('linen','linen'),('polyester','polyester'),
      ('viscose','viscose'),('rayon','rayon'),('acrylic','acrylic'),
      ('polyamide','polyamide'),('nylon','nylon'),('elastane','elastane'),
      ('spandex','elastane'),('leather','leather'),('suede','suede'),
      ('denim','denim'),('modal','modal'),('lyocell','lyocell'),
      ('tencel','lyocell'),('acetate','acetate'),
      ('polyurethane','polyurethane'),('rubber','rubber')
    ) material(needle,tag)
    WHERE sav.attribute_name IN ('material','materials')
      AND lower(sav.option_value) LIKE '%'||material.needle||'%'
  ),
  source_materials AS (
    SELECT source_product_key,array_agg(DISTINCT tag ORDER BY tag) AS materials
    FROM source_material_tags
    GROUP BY source_product_key
  ),
  source_explicit_fits AS (
    SELECT source_product_key,
           array_agg(DISTINCT lower(option_value) ORDER BY lower(option_value)) AS fits
    FROM source_attribute_values
    WHERE attribute_name IN ('fit','fitting')
    GROUP BY source_product_key
  ),
  source_title_fits AS (
    SELECT
      lsp.source_product_key,
      array_remove(ARRAY[
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])slim( fit)?([^a-z]|$)' THEN 'slim' END,
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])regular( fit)?([^a-z]|$)' THEN 'regular' END,
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])relaxed( fit)?([^a-z]|$)' THEN 'relaxed' END,
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])oversized([^a-z]|$)' THEN 'oversized' END,
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])skinny( fit)?([^a-z]|$)' THEN 'skinny' END,
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])straight( fit)?([^a-z]|$)' THEN 'straight' END,
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])loose( fit)?([^a-z]|$)' THEN 'loose' END,
        CASE WHEN lower(COALESCE(lsp.title,'')) ~ '(^|[^a-z])tapered( fit)?([^a-z]|$)' THEN 'tapered' END
      ]::text[],NULL) AS fits
    FROM latest_source_product lsp
  ),
  variant_facts AS MATERIALIZED (
    SELECT
      dso.supplier_id,
      dso.external_product_id,
      dso.availability_expires_at,
      vo.updated_at AS offer_updated_at,
      vo.customer_price_minor,
      vo.msrp_minor,
      c.code AS category_code,
      tree.department_code,
      NULLIF(btrim(COALESCE(b.name,pfb.name,'')),'') AS brand_name,
      lower(NULLIF(btrim(COALESCE(
        el.specifications->>'color',
        en.specifications->>'color',
        cv.variant_attributes->>'color',
        ''
      )),'')) AS color,
      NULLIF(btrim(size_entry.value),'') AS size_value,
      lower(NULLIF(btrim(COALESCE(
        el.specifications->>'fit',
        en.specifications->>'fit',
        ''
      )),'')) AS fit,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      cv.gtin,
      cv.mpn
    FROM ids
    JOIN public.dropship_supplier_offers dso
      ON dso.supplier_id=v_supplier_id
     AND dso.external_product_id=ids.external_product_id
    JOIN public.dropship_suppliers ds
      ON ds.id=dso.supplier_id
     AND ds.active=true
     AND ds.api_authoritative_availability=true
    JOIN public.vendor_offers vo
      ON vo.id=dso.vendor_offer_id
     AND vo.vendor_id=ds.owner_vendor_id
    JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN public.categories c ON c.id=cv.category_id
    JOIN category_tree tree ON tree.id=cv.category_id
    JOIN public.vendor_businesses v ON v.id=vo.vendor_id
    JOIN public.vendor_locations l ON l.id=vo.location_id
    LEFT JOIN public.product_families pf ON pf.id=cv.family_id
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    LEFT JOIN public.brands pfb ON pfb.id=pf.brand_id
    LEFT JOIN public.product_translations el
      ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN public.product_translations en
      ON en.canonical_variant_id=cv.id AND en.locale='en'
    LEFT JOIN LATERAL unnest(array_remove(ARRAY[
      cv.variant_attributes->>'italian_size_men',
      cv.variant_attributes->>'italian_size_women',
      cv.variant_attributes->>'shoe_size_women',
      cv.variant_attributes->>'shoe_size_men',
      cv.variant_attributes->>'waist_size',
      cv.variant_attributes->>'belt_size',
      cv.variant_attributes->>'waist_length_size',
      cv.variant_attributes->>'hat_size',
      cv.variant_attributes->>'swimwear_sleepwear_size',
      cv.variant_attributes->>'shoe_size',
      cv.variant_attributes->>'earrings_size',
      cv.variant_attributes->>'bracelets_size',
      cv.variant_attributes->>'gloves_size_women',
      cv.variant_attributes->>'ring_size',
      cv.variant_attributes->>'gloves_size_men',
      cv.variant_attributes->>'size'
    ]::text[],NULL)) AS size_entry(value) ON true
    WHERE dso.active=true
      AND dso.cached_available=true
      AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
      AND dso.availability_expires_at IS NOT NULL
      AND dso.availability_expires_at>now()
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND v.status='active'
      AND l.active=true
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
  ),
  grouped AS MATERIALIZED (
    SELECT
      vf.supplier_id,
      vf.external_product_id,
      MAX(vf.availability_expires_at) AS available_until,
      MAX(vf.offer_updated_at) AS newest_at,
      MIN(vf.customer_price_minor)::bigint AS min_price_minor,
      MAX(vf.msrp_minor)::bigint AS max_msrp_minor,
      COALESCE(array_agg(DISTINCT vf.category_code)
        FILTER (WHERE vf.category_code IS NOT NULL),'{}'::text[]) AS category_codes,
      COALESCE(array_agg(DISTINCT vf.department_code)
        FILTER (WHERE vf.department_code IS NOT NULL),'{}'::text[]) AS department_codes,
      COALESCE(array_agg(DISTINCT lower(vf.brand_name))
        FILTER (WHERE vf.brand_name IS NOT NULL),'{}'::text[]) AS brand_names,
      COALESCE(array_agg(DISTINCT vf.color)
        FILTER (WHERE vf.color IS NOT NULL),'{}'::text[]) AS colors,
      COALESCE(array_agg(DISTINCT vf.size_value)
        FILTER (WHERE vf.size_value IS NOT NULL),'{}'::text[]) AS sizes,
      COALESCE(array_agg(DISTINCT vf.fit)
        FILTER (WHERE vf.fit IS NOT NULL),'{}'::text[]) AS fits,
      MAX(vf.title) AS sort_title,
      to_tsvector(
        'simple',
        COALESCE(string_agg(DISTINCT concat_ws(
          ' ',vf.title,COALESCE(vf.brand_name,''),COALESCE(vf.gtin,''),
          COALESCE(vf.mpn,''),vf.category_code,vf.department_code
        ),' '),'')
      ) AS search_vector
    FROM variant_facts vf
    GROUP BY vf.supplier_id,vf.external_product_id
  ),
  enriched AS (
    SELECT
      g.*,
      COALESCE((
        SELECT array_agg(DISTINCT value ORDER BY value)
        FROM unnest(g.colors||COALESCE(sc.colors,'{}'::text[])) merged(value)
        WHERE btrim(value)<>''
      ),'{}'::text[]) AS enriched_colors,
      COALESCE((
        SELECT array_agg(DISTINCT value ORDER BY value)
        FROM unnest(g.sizes||COALESCE(ss.sizes,'{}'::text[])) merged(value)
        WHERE btrim(value)<>''
      ),'{}'::text[]) AS enriched_sizes,
      COALESCE((
        SELECT array_agg(DISTINCT value ORDER BY value)
        FROM unnest(
          g.fits||COALESCE(sef.fits,'{}'::text[])||COALESCE(stf.fits,'{}'::text[])
        ) merged(value)
        WHERE btrim(value)<>''
      ),'{}'::text[]) AS enriched_fits,
      COALESCE(sm.materials,'{}'::text[]) AS materials,
      COALESCE(NULLIF(lsp.title,''),g.sort_title,'') AS enriched_sort_title
    FROM grouped g
    LEFT JOIN latest_source_product lsp ON lsp.source_product_key=g.external_product_id
    LEFT JOIN source_colors sc ON sc.source_product_key=g.external_product_id
    LEFT JOIN source_sizes ss ON ss.source_product_key=g.external_product_id
    LEFT JOIN source_materials sm ON sm.source_product_key=g.external_product_id
    LEFT JOIN source_explicit_fits sef ON sef.source_product_key=g.external_product_id
    LEFT JOIN source_title_fits stf ON stf.source_product_key=g.external_product_id
  )
  INSERT INTO bls_private.storefront_dropship_live_family (
    supplier_id,external_product_id,sellable,available_until,newest_at,
    min_price_minor,max_msrp_minor,category_codes,department_codes,
    brand_names,brand_names_normalized,colors,sizes,sizes_text,fits,
    materials,sort_title,search_vector,projected_at
  )
  SELECT
    e.supplier_id,e.external_product_id,true,e.available_until,e.newest_at,
    e.min_price_minor,e.max_msrp_minor,e.category_codes,e.department_codes,
    e.brand_names,e.brand_names,e.enriched_colors,e.enriched_sizes,
    to_jsonb(e.enriched_sizes)::text,e.enriched_fits,e.materials,
    e.enriched_sort_title,
    e.search_vector||to_tsvector('simple',e.enriched_sort_title),
    clock_timestamp()
  FROM enriched e
  ON CONFLICT (supplier_id,external_product_id) DO UPDATE
  SET sellable=EXCLUDED.sellable,
      available_until=EXCLUDED.available_until,
      newest_at=EXCLUDED.newest_at,
      min_price_minor=EXCLUDED.min_price_minor,
      max_msrp_minor=EXCLUDED.max_msrp_minor,
      category_codes=EXCLUDED.category_codes,
      department_codes=EXCLUDED.department_codes,
      brand_names=EXCLUDED.brand_names,
      brand_names_normalized=EXCLUDED.brand_names_normalized,
      colors=EXCLUDED.colors,
      sizes=EXCLUDED.sizes,
      sizes_text=EXCLUDED.sizes_text,
      fits=EXCLUDED.fits,
      materials=EXCLUDED.materials,
      sort_title=EXCLUDED.sort_title,
      search_vector=EXCLUDED.search_vector,
      projected_at=EXCLUDED.projected_at;

  GET DIAGNOSTICS v_projected = ROW_COUNT;
  RETURN v_projected;
END
$function$;

REVOKE ALL
ON FUNCTION bls_private.refresh_nova_storefront_live_families(text[])
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION bls_private.refresh_nova_storefront_live_families(text[])
TO postgres;

-- Reconciled from historical live migration: 20260915_storefront_catalog_autocomplete_expression.sql
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_autocomplete_trgm_idx
  ON public.storefront_catalog_read_model USING gin (
    (lower(title || ' ' || coalesce(brand_name, ''))) gin_trgm_ops
  );

-- Reconciled from historical live migration: 20260915_storefront_catalog_trigram_search.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_title_trgm_idx
  ON public.storefront_catalog_read_model USING gin (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_brand_trgm_idx
  ON public.storefront_catalog_read_model USING gin (lower(brand_name) gin_trgm_ops)
  WHERE brand_name IS NOT NULL;

-- Reconciled from historical live migration: 20260915_storefront_category_availability_index.sql
-- Homepage/category navigation only needs the tiny set of category/department
-- pairs that still have projected sellable inventory. Keep that lookup index-only
-- instead of reading the wide facet materialized view.
CREATE INDEX IF NOT EXISTS storefront_facet_category_availability_idx
  ON public.storefront_facet_read_model (category_code, department_code, available_until);

COMMENT ON INDEX public.storefront_facet_category_availability_idx IS
  'Covering index for currently available storefront category/department navigation.';

-- Reconciled from historical live migration: 20260915_storefront_dropship_family_covering_index.sql
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_dropship_live_cover_idx
  ON public.storefront_catalog_read_model (
    dropship_available_until,
    dropship_supplier_id,
    dropship_external_product_id,
    created_at DESC
  )
  INCLUDE (min_price_minor)
  WHERE dropship_sellable = true
    AND dropship_supplier_id IS NOT NULL
    AND dropship_external_product_id IS NOT NULL;

-- Reconciled from historical live migration: 20260915_storefront_local_candidate_index.sql
-- Keep local candidate discovery O(page size) even when the imported catalogue is
-- overwhelmingly dropship inventory. The partial index is tiny when no local
-- offers are sellable and supports newest-first storefront/crawler discovery.
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_local_newest_idx
  ON public.storefront_catalog_read_model (created_at DESC, canonical_public_id)
  INCLUDE (canonical_variant_id, department_code, local_available_until, min_price_minor)
  WHERE local_sellable = true;

COMMENT ON INDEX public.storefront_catalog_read_model_local_newest_idx IS
  'Newest-first bounded local storefront candidates; avoids scanning the dropship-heavy read model when local inventory is absent or sparse.';

-- Reconciled from historical live migration: 20260915_storefront_seo_signal_indexes.sql
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_title_normalized_idx
  ON public.storefront_catalog_read_model(lower(btrim(title)));
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_slug_idx
  ON public.storefront_catalog_read_model(slug);

-- Reconciled from historical live migration: 20260915_vendor_family_read_model_index.sql
CREATE INDEX IF NOT EXISTS storefront_dropship_family_supplier_newest_idx
  ON public.storefront_dropship_family_read_model(
    dropship_supplier_id,
    newest_at DESC,
    dropship_external_product_id
  );

-- Reconciled from historical live migration: 20260929_p0_vendor_local_catalog_fast_index.sql
-- P0: keep large mixed vendor storefronts from scanning supplier-backed offers
-- when the initial local/assigned assortment is requested. The supplier-offer
-- anti-join remains in the read path as the final correctness check.
CREATE INDEX IF NOT EXISTS vendor_offers_vendor_local_catalog_idx
ON public.vendor_offers (vendor_id, updated_at DESC, id)
INCLUDE (canonical_variant_id, location_id, customer_price_minor)
WHERE status='approved'
  AND COALESCE(merchant_visible,true)=true
  AND COALESCE(merchant_pause_active,false)=false
  AND customer_price_minor>0
  AND COALESCE(source_payload->>'dropship','false') <> 'true';

-- Reconciled from historical live migration: 20261002_merchant_sync_strict_shard_index.sql
-- Bound Google Merchant catalogue selection to the declared 144-way shard.
-- The previous candidate path allowed unsynced products to bypass the shard
-- predicate, forcing a catalogue-wide live-offer scan every ten minutes.
CREATE INDEX IF NOT EXISTS canonical_variants_merchant_shard_144_idx
ON public.canonical_variants (
  (mod(abs(hashtext(public_id)::bigint), 144))
)
WHERE active=true AND suppressed=false AND recalled=false;

-- Reconciled structural state from historical live migration: 20261002_seo_recovery_load_shedding.sql
CREATE INDEX IF NOT EXISTS storefront_catalog_read_model_seo_shard_idx
ON public.storefront_catalog_read_model (
  (mod(get_byte(decode(md5(canonical_public_id), 'hex'), 0), 64)),
  canonical_public_id
);

-- Reconciled from historical live migration: 20261001_vendor_instagram_storefront.sql
-- KONTA MOY — vendor Instagram storefront connection metadata and encrypted OAuth token storage.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_instagram_connections (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  instagram_user_id text NOT NULL,
  username text NOT NULL,
  account_type text,
  profile_picture_url text,
  access_token_ciphertext text NOT NULL,
  token_expires_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  refreshed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_instagram_connections_username_check
    CHECK (username ~ '^[A-Za-z0-9._]{1,30}$'),
  CONSTRAINT vendor_instagram_connections_account_type_check
    CHECK (account_type IS NULL OR account_type IN ('BUSINESS','MEDIA_CREATOR','CREATOR'))
);

ALTER TABLE public.vendor_instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_instagram_connections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.vendor_instagram_connections FROM PUBLIC;
REVOKE ALL ON public.vendor_instagram_connections FROM anon;
REVOKE ALL ON public.vendor_instagram_connections FROM authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_instagram_connections TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_instagram_connections TO bls_platform_runtime;

DROP POLICY IF EXISTS vendor_instagram_connections_scope ON public.vendor_instagram_connections;
CREATE POLICY vendor_instagram_connections_scope
ON public.vendor_instagram_connections
FOR ALL
TO bls_app_runtime
USING (
  (SELECT bls_private.is_platform_runtime())
  OR vendor_id = (SELECT bls_private.current_vendor_scope_id())
)
WITH CHECK (
  (SELECT bls_private.is_platform_runtime())
  OR vendor_id = (SELECT bls_private.current_vendor_scope_id())
);

DROP POLICY IF EXISTS vendor_instagram_connections_platform ON public.vendor_instagram_connections;
CREATE POLICY vendor_instagram_connections_platform
ON public.vendor_instagram_connections
FOR ALL
TO bls_platform_runtime
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.vendor_instagram_connections IS
  'Vendor-scoped Instagram professional account connection for storefront media. OAuth tokens are application-encrypted and never returned to browser clients.';
COMMENT ON COLUMN public.vendor_instagram_connections.access_token_ciphertext IS
  'AES-256-GCM encrypted long-lived Instagram access token. Decryption key is derived server-side from BLS_AUTH_SECRET.';

-- Reconciled from historical live migration: 20261002_vendor_locations_rls_empty_context.sql
-- Harden vendor_locations RLS against an unset vendor session context.
-- Platform-runtime jobs intentionally run without app.vendor_id. PostgreSQL may
-- evaluate both sides of an OR policy expression, so casting current_setting()
-- directly can raise 22P02 on the empty string before the platform bypass wins.

ALTER POLICY vendor_locations_vendor_read
ON public.vendor_locations
USING (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
);

ALTER POLICY vendor_locations_vendor_insert
ON public.vendor_locations
WITH CHECK (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
);

ALTER POLICY vendor_locations_vendor_update
ON public.vendor_locations
USING (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
)
WITH CHECK (
  vendor_id = NULLIF(current_setting('app.vendor_id', true), '')::uuid
  OR (SELECT bls_private.is_platform_runtime())
);

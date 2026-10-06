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

-- Canonical final refresh schedule. pg_cron is available in Supabase production
-- but is intentionally optional for portable fresh-database CI/development.
-- The schema/read models are always created; scheduling is installed only when
-- the cron extension is present.
DO $do$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = ANY ($1)'
      USING ARRAY[
        'refresh-storefront-catalog-read-model',
        'refresh-storefront-dropship-family-read-model',
        'refresh-storefront-facet-read-model',
        'refresh-storefront-filter-read-model',
        'refresh-storefront-dropship-family-filter-read-model',
        'refresh-storefront-dropship-vendor-facets',
        'refresh-storefront-vendor-assortment-read-model'
      ]::text[];

    EXECUTE 'SELECT cron.schedule($1::text,$2::text,$3::text)'
      USING 'refresh-storefront-catalog-read-model',
            '0-55/5 * * * *',
            'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_catalog_read_model';
    EXECUTE 'SELECT cron.schedule($1::text,$2::text,$3::text)'
      USING 'refresh-storefront-dropship-family-read-model',
            '1-56/5 * * * *',
            'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_read_model';
    EXECUTE 'SELECT cron.schedule($1::text,$2::text,$3::text)'
      USING 'refresh-storefront-facet-read-model',
            '2-57/5 * * * *',
            'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_facet_read_model';
    EXECUTE 'SELECT cron.schedule($1::text,$2::text,$3::text)'
      USING 'refresh-storefront-filter-read-model',
            '3-58/10 * * * *',
            'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_filter_read_model';
    EXECUTE 'SELECT cron.schedule($1::text,$2::text,$3::text)'
      USING 'refresh-storefront-dropship-family-filter-read-model',
            '4-59/5 * * * *',
            'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_family_filter_read_model';
    EXECUTE 'SELECT cron.schedule($1::text,$2::text,$3::text)'
      USING 'refresh-storefront-dropship-vendor-facets',
            '5-59/5 * * * *',
            'REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_dropship_vendor_facets';
    EXECUTE 'SELECT cron.schedule($1::text,$2::text,$3::text)'
      USING 'refresh-storefront-vendor-assortment-read-model',
            '55 * * * *',
            'SET statement_timeout=''240s''; REFRESH MATERIALIZED VIEW CONCURRENTLY public.storefront_vendor_assortment_read_model';
  ELSE
    RAISE NOTICE 'pg_cron is unavailable; storefront projection refresh jobs were not scheduled';
  END IF;
END
$do$;

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

-- Add an incremental live storefront projection path for Symphonya.
--
-- The existing live projection table is supplier-agnostic. BrandsGateway already
-- updates it after authoritative availability batches; this function gives
-- Symphonya the same fail-closed freshness path without re-enabling expensive
-- raw storefront fallback queries.

CREATE OR REPLACE FUNCTION bls_private.refresh_symphonya_storefront_live_families(
  p_external_product_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, bls_private
AS $function$
DECLARE
  v_supplier_id uuid;
  v_projected integer := 0;
BEGIN
  IF COALESCE(cardinality(p_external_product_ids), 0) = 0 THEN
    RETURN 0;
  END IF;

  SELECT ds.id
    INTO v_supplier_id
    FROM public.dropship_suppliers ds
   WHERE ds.code = 'symphonya'
     AND ds.active = true
     AND ds.api_authoritative_availability = true
   LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM bls_private.storefront_dropship_live_family lf
   WHERE lf.supplier_id = v_supplier_id
     AND lf.external_product_id = ANY(p_external_product_ids);

  -- Fresh unavailable evidence gets a tombstone row. This prevents an older
  -- materialized-view row from resurfacing as sellable while the TTL is valid.
  INSERT INTO bls_private.storefront_dropship_live_family (
    supplier_id,
    external_product_id,
    sellable,
    available_until,
    newest_at,
    projected_at
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
     WHERE value IS NOT NULL
       AND btrim(value) <> ''
  ) ids
  JOIN public.dropship_supplier_offers dso
    ON dso.supplier_id = v_supplier_id
   AND dso.external_product_id = ids.external_product_id
   AND dso.active = true
   AND dso.availability_expires_at IS NOT NULL
   AND dso.availability_expires_at > now()
  GROUP BY ids.external_product_id;

  WITH RECURSIVE
  ids AS MATERIALIZED (
    SELECT DISTINCT value AS external_product_id
      FROM unnest(p_external_product_ids) value
     WHERE value IS NOT NULL
       AND btrim(value) <> ''
  ),
  category_tree AS MATERIALIZED (
    SELECT c.id, c.parent_id, c.code, c.code AS department_code
      FROM public.categories c
      JOIN public.markets m ON m.id = c.market_id
     WHERE m.code = 'sparta'
       AND c.parent_id IS NULL

    UNION ALL

    SELECT child.id, child.parent_id, child.code, parent.department_code
      FROM public.categories child
      JOIN category_tree parent ON child.parent_id = parent.id
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
      NULLIF(btrim(COALESCE(b.name, pfb.name, '')), '') AS brand_name,
      lower(NULLIF(btrim(COALESCE(
        el.specifications->>'color',
        en.specifications->>'color',
        cv.variant_attributes->>'color',
        ''
      )), '')) AS color,
      NULLIF(btrim(size_entry.value), '') AS size_value,
      lower(NULLIF(btrim(COALESCE(
        el.specifications->>'fit',
        en.specifications->>'fit',
        cv.variant_attributes->>'fit',
        ''
      )), '')) AS fit,
      lower(NULLIF(btrim(COALESCE(
        el.specifications->>'material',
        en.specifications->>'material',
        el.specifications->>'composition',
        en.specifications->>'composition',
        cv.variant_attributes->>'material',
        ''
      )), '')) AS material,
      COALESCE(el.title, en.title, cv.model, cv.slug) AS title,
      COALESCE(el.description, en.description, '') AS description,
      cv.gtin,
      cv.mpn
    FROM ids
    JOIN public.dropship_supplier_offers dso
      ON dso.supplier_id = v_supplier_id
     AND dso.external_product_id = ids.external_product_id
    JOIN public.dropship_suppliers ds
      ON ds.id = dso.supplier_id
     AND ds.active = true
     AND ds.api_authoritative_availability = true
    JOIN public.vendor_offers vo
      ON vo.id = dso.vendor_offer_id
     AND vo.vendor_id = ds.owner_vendor_id
    JOIN public.canonical_variants cv ON cv.id = vo.canonical_variant_id
    JOIN public.categories c ON c.id = cv.category_id
    JOIN category_tree tree ON tree.id = cv.category_id
    JOIN public.vendor_businesses v ON v.id = vo.vendor_id
    JOIN public.vendor_locations l ON l.id = vo.location_id
    LEFT JOIN public.product_families pf ON pf.id = cv.family_id
    LEFT JOIN public.brands b ON b.id = cv.brand_id
    LEFT JOIN public.brands pfb ON pfb.id = pf.brand_id
    LEFT JOIN public.product_translations el
      ON el.canonical_variant_id = cv.id
     AND el.locale = 'el'
    LEFT JOIN public.product_translations en
      ON en.canonical_variant_id = cv.id
     AND en.locale = 'en'
    LEFT JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(COALESCE(
          el.specifications->'sizes',
          en.specifications->'sizes',
          cv.variant_attributes->'sizes_observed'
        )) = 'array'
        THEN COALESCE(
          el.specifications->'sizes',
          en.specifications->'sizes',
          cv.variant_attributes->'sizes_observed'
        )
        ELSE '[]'::jsonb
      END
    ) size_entry(value) ON true
    WHERE dso.active = true
      AND dso.cached_available = true
      AND (dso.cached_quantity IS NULL OR dso.cached_quantity >= 1)
      AND dso.availability_expires_at IS NOT NULL
      AND dso.availability_expires_at > now()
      AND vo.status = 'approved'
      AND vo.merchant_visible = true
      AND vo.merchant_pause_active = false
      AND vo.customer_price_minor > 0
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor <= vo.cost_ceiling_minor)
      AND COALESCE(cv.commerce_channel, 'normal') = 'normal'
      AND cv.active = true
      AND cv.suppressed = false
      AND cv.recalled = false
      AND v.status = 'active'
      AND l.active = true
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id, cv.category_id)
  ),
  grouped AS MATERIALIZED (
    SELECT
      vf.supplier_id,
      vf.external_product_id,
      MAX(vf.availability_expires_at) AS available_until,
      MAX(vf.offer_updated_at) AS newest_at,
      MIN(vf.customer_price_minor)::bigint AS min_price_minor,
      MAX(vf.msrp_minor)::bigint AS max_msrp_minor,
      COALESCE(
        array_agg(DISTINCT vf.category_code)
          FILTER (WHERE vf.category_code IS NOT NULL),
        '{}'::text[]
      ) AS category_codes,
      COALESCE(
        array_agg(DISTINCT vf.department_code)
          FILTER (WHERE vf.department_code IS NOT NULL),
        '{}'::text[]
      ) AS department_codes,
      COALESCE(
        array_agg(DISTINCT lower(vf.brand_name))
          FILTER (WHERE vf.brand_name IS NOT NULL),
        '{}'::text[]
      ) AS brand_names,
      COALESCE(
        array_agg(DISTINCT vf.color)
          FILTER (WHERE vf.color IS NOT NULL),
        '{}'::text[]
      ) AS colors,
      COALESCE(
        array_agg(DISTINCT vf.size_value)
          FILTER (WHERE vf.size_value IS NOT NULL),
        '{}'::text[]
      ) AS sizes,
      COALESCE(
        array_agg(DISTINCT vf.fit)
          FILTER (WHERE vf.fit IS NOT NULL),
        '{}'::text[]
      ) AS fits,
      COALESCE(
        array_agg(DISTINCT vf.material)
          FILTER (WHERE vf.material IS NOT NULL),
        '{}'::text[]
      ) AS materials,
      MAX(vf.title) AS sort_title,
      to_tsvector(
        'simple',
        COALESCE(
          string_agg(
            DISTINCT concat_ws(
              ' ',
              vf.title,
              vf.description,
              COALESCE(vf.brand_name, ''),
              COALESCE(vf.gtin, ''),
              COALESCE(vf.mpn, ''),
              vf.category_code,
              vf.department_code
            ),
            ' '
          ),
          ''
        )
      ) AS search_vector
    FROM variant_facts vf
    GROUP BY vf.supplier_id, vf.external_product_id
  )
  INSERT INTO bls_private.storefront_dropship_live_family (
    supplier_id,
    external_product_id,
    sellable,
    available_until,
    newest_at,
    min_price_minor,
    max_msrp_minor,
    category_codes,
    department_codes,
    brand_names,
    brand_names_normalized,
    colors,
    sizes,
    sizes_text,
    fits,
    materials,
    sort_title,
    search_vector,
    projected_at
  )
  SELECT
    g.supplier_id,
    g.external_product_id,
    true,
    g.available_until,
    g.newest_at,
    g.min_price_minor,
    g.max_msrp_minor,
    g.category_codes,
    g.department_codes,
    g.brand_names,
    g.brand_names,
    g.colors,
    g.sizes,
    to_jsonb(g.sizes)::text,
    g.fits,
    g.materials,
    COALESCE(g.sort_title, ''),
    g.search_vector,
    clock_timestamp()
  FROM grouped g
  ON CONFLICT (supplier_id, external_product_id) DO UPDATE
  SET sellable = EXCLUDED.sellable,
      available_until = EXCLUDED.available_until,
      newest_at = EXCLUDED.newest_at,
      min_price_minor = EXCLUDED.min_price_minor,
      max_msrp_minor = EXCLUDED.max_msrp_minor,
      category_codes = EXCLUDED.category_codes,
      department_codes = EXCLUDED.department_codes,
      brand_names = EXCLUDED.brand_names,
      brand_names_normalized = EXCLUDED.brand_names_normalized,
      colors = EXCLUDED.colors,
      sizes = EXCLUDED.sizes,
      sizes_text = EXCLUDED.sizes_text,
      fits = EXCLUDED.fits,
      materials = EXCLUDED.materials,
      sort_title = EXCLUDED.sort_title,
      search_vector = EXCLUDED.search_vector,
      projected_at = EXCLUDED.projected_at;

  GET DIAGNOSTICS v_projected = ROW_COUNT;
  RETURN v_projected;
END
$function$;

REVOKE ALL
ON FUNCTION bls_private.refresh_symphonya_storefront_live_families(text[])
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION bls_private.refresh_symphonya_storefront_live_families(text[])
TO postgres;

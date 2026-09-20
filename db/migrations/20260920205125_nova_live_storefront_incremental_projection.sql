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

-- The previous reactive projection jobs wrapped every heavy materialized-view
-- refresh in one pg_cron statement. Hosted statement timeout killed those jobs
-- repeatedly. Batch freshness now uses the compact projection above; the long
-- running GitHub Actions worker owns the full materialized-view rebuild.
DO $$
DECLARE job record;
BEGIN
  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'refresh-storefront-projection-nova-cycle',
      'refresh-storefront-projection-fallback'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END
$$;

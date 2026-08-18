-- Buy Local Sparta — variant matrix definitions, identity signatures, and safe
-- materialization of the two current multi-size apparel source records.

BEGIN;

-- ---------------------------------------------------------------------------
-- Family-specific available options for Product Type variant axes
-- ---------------------------------------------------------------------------
CREATE TABLE product_family_variant_axis_options (
  family_id uuid NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  option_key text NOT NULL,
  attribute_value_id uuid,
  text_value text,
  number_value numeric,
  boolean_value boolean,
  dimension_value jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'catalog_admin'
    CHECK (source IN ('catalog_admin','vendor_submission','import','matching','enrichment','migration')),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id,attribute_id,option_key),
  FOREIGN KEY (attribute_value_id,attribute_id)
    REFERENCES attribute_values(id,attribute_id),
  CHECK (length(btrim(option_key)) > 0),
  CHECK (num_nonnulls(attribute_value_id,text_value,number_value,boolean_value,dimension_value)=1)
);
CREATE INDEX product_family_variant_axis_options_attribute_idx
  ON product_family_variant_axis_options(attribute_id,family_id,active);

CREATE OR REPLACE FUNCTION bls_private.validate_family_variant_axis_option()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  product_type_id_value uuid;
  attribute_data_type text;
BEGIN
  SELECT pf.product_type_id INTO product_type_id_value
  FROM public.product_families pf WHERE pf.id=NEW.family_id;
  IF NOT FOUND OR product_type_id_value IS NULL THEN
    RAISE EXCEPTION 'family must have a Product Type before variant-axis options are configured';
  END IF;

  SELECT ad.data_type INTO attribute_data_type
  FROM public.product_type_attributes pta
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  WHERE pta.product_type_id=product_type_id_value
    AND pta.attribute_id=NEW.attribute_id
    AND pta.variant_defining=true
    AND pta.value_level='variant';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attribute is not a variant-defining axis for this Product Type';
  END IF;

  IF NEW.attribute_value_id IS NOT NULL AND attribute_data_type NOT IN ('enum','multienum') THEN
    RAISE EXCEPTION 'controlled option does not match attribute type %',attribute_data_type;
  ELSIF NEW.text_value IS NOT NULL AND attribute_data_type<>'text' THEN
    RAISE EXCEPTION 'text option does not match attribute type %',attribute_data_type;
  ELSIF NEW.number_value IS NOT NULL AND attribute_data_type<>'number' THEN
    RAISE EXCEPTION 'number option does not match attribute type %',attribute_data_type;
  ELSIF NEW.boolean_value IS NOT NULL AND attribute_data_type<>'boolean' THEN
    RAISE EXCEPTION 'boolean option does not match attribute type %',attribute_data_type;
  ELSIF NEW.dimension_value IS NOT NULL AND attribute_data_type<>'dimension' THEN
    RAISE EXCEPTION 'dimension option does not match attribute type %',attribute_data_type;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER product_family_variant_axis_options_validate
  BEFORE INSERT OR UPDATE ON product_family_variant_axis_options
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_family_variant_axis_option();

-- ---------------------------------------------------------------------------
-- Deterministic variant identity signature per family
-- ---------------------------------------------------------------------------
ALTER TABLE canonical_variants
  ADD COLUMN variant_identity_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN variant_identity_hash text;

CREATE UNIQUE INDEX canonical_variants_family_identity_unique_idx
  ON canonical_variants(family_id,variant_identity_hash)
  WHERE variant_identity_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION bls_private.refresh_canonical_variant_identity(target_variant_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  identity_snapshot jsonb;
  identity_hash text;
  axis_count integer;
BEGIN
  SELECT count(*) INTO axis_count
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id
  JOIN public.product_type_attributes pta ON pta.product_type_id=pf.product_type_id
  WHERE cv.id=target_variant_id AND pta.variant_defining=true AND pta.value_level='variant';

  IF axis_count=0 THEN
    UPDATE public.canonical_variants
    SET variant_identity_snapshot='{}'::jsonb,variant_identity_hash=NULL,updated_at=now()
    WHERE id=target_variant_id;
    RETURN;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'attribute',ad.code,
      'axis_order',pta.variant_axis_order,
      'value',COALESCE(
        av.code,
        vav.text_value,
        CASE WHEN vav.number_value IS NOT NULL THEN vav.number_value::text END,
        CASE WHEN vav.boolean_value IS NOT NULL THEN vav.boolean_value::text END,
        CASE WHEN vav.dimension_value IS NOT NULL THEN vav.dimension_value::text END,
        '__null__'
      )
    ) ORDER BY pta.variant_axis_order,ad.code
  )
  INTO identity_snapshot
  FROM public.canonical_variants cv
  JOIN public.product_families pf ON pf.id=cv.family_id
  JOIN public.product_type_attributes pta ON pta.product_type_id=pf.product_type_id
      AND pta.variant_defining=true AND pta.value_level='variant'
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  LEFT JOIN public.canonical_variant_attribute_values vav
    ON vav.canonical_variant_id=cv.id AND vav.attribute_id=pta.attribute_id AND vav.position=0
  LEFT JOIN public.attribute_values av ON av.id=vav.attribute_value_id
  WHERE cv.id=target_variant_id;

  identity_hash := encode(digest(identity_snapshot::text,'sha256'),'hex');

  UPDATE public.canonical_variants
  SET variant_identity_snapshot=identity_snapshot,variant_identity_hash=identity_hash,updated_at=now()
  WHERE id=target_variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.refresh_variant_identity_from_attribute()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM bls_private.refresh_canonical_variant_identity(
    CASE WHEN TG_OP='DELETE' THEN OLD.canonical_variant_id ELSE NEW.canonical_variant_id END
  );
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER canonical_variant_attribute_values_refresh_identity
  AFTER INSERT OR UPDATE OR DELETE ON canonical_variant_attribute_values
  FOR EACH ROW EXECUTE FUNCTION bls_private.refresh_variant_identity_from_attribute();

COMMENT ON COLUMN canonical_variants.variant_identity_snapshot IS
  'Ordered Product-Type variant-axis snapshot used to prove why two canonical variants differ.';
COMMENT ON COLUMN canonical_variants.variant_identity_hash IS
  'SHA-256 of variant_identity_snapshot; unique within a Product Family when variant axes exist.';

-- Matrix observability. Expected count is the Cartesian product of configured active
-- options across configured axes; it is advisory until every Product Type axis is configured.
CREATE VIEW product_family_variant_matrix_status AS
WITH option_counts AS (
  SELECT family_id,attribute_id,count(*)::numeric AS option_count
  FROM product_family_variant_axis_options
  WHERE active=true
  GROUP BY family_id,attribute_id
),
configured AS (
  SELECT family_id,count(*) AS configured_axis_count,
         round(exp(sum(ln(option_count))))::bigint AS expected_variant_count
  FROM option_counts
  GROUP BY family_id
),
required_axes AS (
  SELECT pf.id AS family_id,count(*) AS product_type_axis_count
  FROM product_families pf
  LEFT JOIN product_type_attributes pta
    ON pta.product_type_id=pf.product_type_id
   AND pta.variant_defining=true
   AND pta.value_level='variant'
  GROUP BY pf.id
),
materialized AS (
  SELECT family_id,count(*) AS materialized_variant_count
  FROM canonical_variants
  GROUP BY family_id
)
SELECT pf.id AS family_id,pt.code AS product_type_code,
       ra.product_type_axis_count,
       COALESCE(c.configured_axis_count,0) AS configured_axis_count,
       CASE WHEN COALESCE(c.configured_axis_count,0)=ra.product_type_axis_count
            THEN COALESCE(c.expected_variant_count,CASE WHEN ra.product_type_axis_count=0 THEN 1 ELSE 0 END)
            ELSE NULL END AS expected_variant_count,
       COALESCE(m.materialized_variant_count,0) AS materialized_variant_count,
       (COALESCE(c.configured_axis_count,0)=ra.product_type_axis_count) AS axes_fully_configured
FROM product_families pf
LEFT JOIN product_types pt ON pt.id=pf.product_type_id
JOIN required_axes ra ON ra.family_id=pf.id
LEFT JOIN configured c ON c.family_id=pf.id
LEFT JOIN materialized m ON m.family_id=pf.id;

-- ---------------------------------------------------------------------------
-- Safe materialization of current apparel source size matrices
-- Preconditions were verified before migration: target variants have no offers, carts,
-- orders, reviews, saves, promotions, analytics, conversations or appointments.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _size_expansion ON COMMIT DROP AS
SELECT
  cv.id AS source_variant_id,
  cv.family_id,
  lower(sz.size_label) AS size_code,
  sz.size_label,
  sz.ordinality::integer AS ordinality
FROM canonical_variants cv
CROSS JOIN LATERAL jsonb_array_elements_text(cv.variant_attributes->'sizes_observed') WITH ORDINALITY AS sz(size_label,ordinality)
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id
WHERE pt.code IN ('apparel','dress','shirt','top','footwear','running_shoe')
  AND jsonb_typeof(cv.variant_attributes->'sizes_observed')='array'
  AND jsonb_array_length(cv.variant_attributes->'sizes_observed')>1;

-- Fail closed if any observed size cannot be normalized to the controlled apparel vocabulary.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _size_expansion se
    LEFT JOIN attribute_definitions ad ON ad.code='apparel_size'
    LEFT JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=se.size_code
    WHERE av.id IS NULL
  ) THEN
    RAISE EXCEPTION 'unmapped apparel size encountered; variant matrix materialization aborted';
  END IF;
END;
$$;

CREATE TEMP TABLE _variant_map (
  source_variant_id uuid NOT NULL,
  size_code text NOT NULL,
  size_label text NOT NULL,
  ordinality integer NOT NULL,
  canonical_variant_id uuid NOT NULL,
  is_existing boolean NOT NULL,
  PRIMARY KEY(source_variant_id,size_code)
) ON COMMIT DROP;

INSERT INTO _variant_map
SELECT source_variant_id,size_code,size_label,ordinality,
       CASE WHEN ordinality=1 THEN source_variant_id ELSE gen_random_uuid() END,
       ordinality=1
FROM _size_expansion;

-- New canonical size variants inherit stable family/product commercial fields but no GTIN.
INSERT INTO canonical_variants(
  id,market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,
  variant_attributes,warranty_basis,platform_price_minor,currency,tax_rate_bps,
  active,suppressed,recalled,price_updated_at
)
SELECT
  vm.canonical_variant_id,src.market_id,src.family_id,src.brand_id,src.category_id,
  src.slug||'-'||vm.size_code,
  NULL,src.mpn,src.model,src.condition,
  (src.variant_attributes-'sizes_observed') || jsonb_build_object(
    'source_sizes_observed',src.variant_attributes->'sizes_observed',
    'normalized_size',vm.size_label,
    'normalized_from_variant_id',src.id::text
  ),
  src.warranty_basis,src.platform_price_minor,src.currency,src.tax_rate_bps,
  src.active,src.suppressed,src.recalled,src.price_updated_at
FROM _variant_map vm
JOIN canonical_variants src ON src.id=vm.source_variant_id
WHERE NOT vm.is_existing;

-- Clone translations; structured normalized size is added to specifications while the
-- customer title stays family-like and can be rendered with selected variant attributes.
INSERT INTO product_translations(
  canonical_variant_id,locale,title,description,specifications,seo_title,seo_description
)
SELECT vm.canonical_variant_id,t.locale,t.title,t.description,
       t.specifications || jsonb_build_object('normalized_size',vm.size_label),
       t.seo_title,t.seo_description
FROM _variant_map vm
JOIN product_translations t ON t.canonical_variant_id=vm.source_variant_id
WHERE NOT vm.is_existing
ON CONFLICT (canonical_variant_id,locale) DO NOTHING;

-- Clone secondary/merchandising taxonomy placements if any.
INSERT INTO canonical_variant_category_assignments(
  canonical_variant_id,category_id,assignment_type,source,confidence
)
SELECT vm.canonical_variant_id,a.category_id,a.assignment_type,'catalog_admin',a.confidence
FROM _variant_map vm
JOIN canonical_variant_category_assignments a ON a.canonical_variant_id=vm.source_variant_id
WHERE NOT vm.is_existing
ON CONFLICT DO NOTHING;

-- Insert the size axis first. This keeps identity hashes distinct even before other axis
-- attributes are copied to newly-created variants.
INSERT INTO canonical_variant_attribute_values(
  canonical_variant_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT vm.canonical_variant_id,ad.id,0,av.id,'migration',1.00000
FROM _variant_map vm
JOIN attribute_definitions ad ON ad.code='apparel_size'
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=vm.size_code
ON CONFLICT (canonical_variant_id,attribute_id,position) DO NOTHING;

-- Copy other normalized variant-level attributes such as exact manufacturer colour.
INSERT INTO canonical_variant_attribute_values(
  canonical_variant_id,attribute_id,position,attribute_value_id,text_value,number_value,
  boolean_value,dimension_value,source,confidence
)
SELECT vm.canonical_variant_id,vav.attribute_id,vav.position,vav.attribute_value_id,
       vav.text_value,vav.number_value,vav.boolean_value,vav.dimension_value,'migration',vav.confidence
FROM _variant_map vm
JOIN canonical_variant_attribute_values vav ON vav.canonical_variant_id=vm.source_variant_id
JOIN attribute_definitions ad ON ad.id=vav.attribute_id AND ad.code<>'apparel_size'
WHERE NOT vm.is_existing
ON CONFLICT (canonical_variant_id,attribute_id,position) DO NOTHING;

-- Normalize original source variants to their first concrete size while retaining the
-- original observed list under a provenance-named field.
UPDATE canonical_variants cv
SET variant_attributes=(cv.variant_attributes-'sizes_observed') || jsonb_build_object(
      'source_sizes_observed',cv.variant_attributes->'sizes_observed',
      'normalized_size',vm.size_label
    ),
    updated_at=now()
FROM _variant_map vm
WHERE vm.is_existing AND vm.source_variant_id=cv.id;

UPDATE product_translations t
SET specifications=t.specifications || jsonb_build_object('normalized_size',vm.size_label)
FROM _variant_map vm
WHERE vm.is_existing AND t.canonical_variant_id=vm.source_variant_id;

-- Family matrix option configuration: exact manufacturer colour plus all observed sizes.
INSERT INTO product_family_variant_axis_options(
  family_id,attribute_id,option_key,text_value,sort_order,source,source_reference
)
SELECT DISTINCT pf.id,ad.id,
       bls_private.normalize_catalog_alias(vav.text_value),vav.text_value,10,'migration','legacy.variant_attributes.color'
FROM _variant_map vm
JOIN product_families pf ON pf.id=(SELECT family_id FROM canonical_variants WHERE id=vm.source_variant_id)
JOIN canonical_variant_attribute_values vav ON vav.canonical_variant_id=vm.source_variant_id
JOIN attribute_definitions ad ON ad.id=vav.attribute_id AND ad.code='manufacturer_colour'
ON CONFLICT DO NOTHING;

INSERT INTO product_family_variant_axis_options(
  family_id,attribute_id,option_key,attribute_value_id,sort_order,source,source_reference
)
SELECT DISTINCT se.family_id,ad.id,se.size_code,av.id,se.ordinality*10,'migration','legacy.variant_attributes.sizes_observed'
FROM _size_expansion se
JOIN attribute_definitions ad ON ad.code='apparel_size'
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=se.size_code
ON CONFLICT DO NOTHING;

-- Initial price-history evidence for newly materialized variants.
INSERT INTO platform_price_history(
  market_id,canonical_variant_id,currency,price_minor,effective_at,actor_id,
  actor_public_id,reason,source
)
SELECT cv.market_id,cv.id,cv.currency,cv.platform_price_minor,now(),NULL,
       'system:catalog-variant-matrix','Materialized from verified source size options','initial'
FROM _variant_map vm
JOIN canonical_variants cv ON cv.id=vm.canonical_variant_id
WHERE NOT vm.is_existing;

-- Refresh signatures after all axis values are in place.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT canonical_variant_id FROM _variant_map LOOP
    PERFORM bls_private.refresh_canonical_variant_identity(r.canonical_variant_id);
  END LOOP;
END;
$$;

-- Resolve the explicit quality issues only when matrix counts match their configured
-- Cartesian expectation and every axis is configured.
UPDATE catalog_quality_issues qi
SET status='resolved',resolved_at=now(),updated_at=now(),
    resolution='Distinct canonical size variants materialized from observed source sizes; original canonical ID retained as one matrix member.'
FROM product_family_variant_matrix_status ms
WHERE qi.issue_code='variant_matrix_unmaterialized'
  AND qi.status='open'
  AND qi.family_id=ms.family_id
  AND ms.axes_fully_configured=true
  AND ms.expected_variant_count=ms.materialized_variant_count;

ALTER TABLE product_family_variant_axis_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY bls_platform_runtime_all ON product_family_variant_axis_options
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

-- Buy Local Sparta — Product Types, normalized attribute values and typed assignments.
-- Additive migration. Legacy canonical_variants.variant_attributes and the legacy
-- attribute_definitions.values/variant_identity/filterable columns remain intact for
-- compatibility while the new normalized model is adopted.

BEGIN;

-- ---------------------------------------------------------------------------
-- Product Types
-- ---------------------------------------------------------------------------
CREATE TABLE product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','retired')),
  product_mode text NOT NULL DEFAULT 'standard'
    CHECK (product_mode IN ('standard','configurable','made_to_order')),
  variant_strategy text NOT NULL DEFAULT 'matrix'
    CHECK (variant_strategy IN ('none','matrix','configurable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(code)) > 0),
  CHECK (product_mode <> 'configurable' OR variant_strategy = 'configurable')
);

CREATE TABLE product_type_translations (
  product_type_id uuid NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  description text,
  PRIMARY KEY (product_type_id, locale),
  CHECK (length(btrim(locale)) > 0),
  CHECK (length(btrim(name)) > 0)
);

CREATE TABLE category_product_types (
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  product_type_id uuid NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, product_type_id)
);

CREATE UNIQUE INDEX category_product_types_one_default_idx
  ON category_product_types(category_id)
  WHERE is_default = true;
CREATE INDEX category_product_types_type_idx
  ON category_product_types(product_type_id, category_id);

CREATE OR REPLACE FUNCTION bls_private.validate_category_product_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  category_assignable boolean;
BEGIN
  SELECT assignable INTO category_assignable
  FROM public.categories
  WHERE id = NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'category % does not exist', NEW.category_id;
  END IF;

  IF NOT category_assignable THEN
    RAISE EXCEPTION 'product types can only be mapped directly to assignable categories';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER category_product_types_validate
  BEFORE INSERT OR UPDATE OF category_id ON category_product_types
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_category_product_type();

ALTER TABLE product_families
  ADD COLUMN product_type_id uuid REFERENCES product_types(id);
CREATE INDEX product_families_product_type_idx
  ON product_families(product_type_id, active);

COMMENT ON TABLE product_types IS
  'Stable semantic product schemas. Product Type answers what kind of object a product is; taxonomy answers where customers find it.';
COMMENT ON TABLE category_product_types IS
  'Maps one or more Product Types to assignable taxonomy nodes. A category may nominate one default Product Type.';
COMMENT ON COLUMN product_families.product_type_id IS
  'Authoritative Product Type for the family and all of its canonical variants.';

-- ---------------------------------------------------------------------------
-- Attribute definition evolution
-- ---------------------------------------------------------------------------
ALTER TABLE attribute_definitions
  ADD COLUMN value_mode text NOT NULL DEFAULT 'free',
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN group_code text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE attribute_definitions
  ADD CONSTRAINT attribute_definitions_value_mode_check
  CHECK (value_mode IN ('free','controlled','mixed'));

-- Existing global flags are retained only as compatibility hints. New Product Type
-- rules below are authoritative for filterability and variant identity.
COMMENT ON COLUMN attribute_definitions.variant_identity IS
  'Legacy compatibility hint only. Authoritative variant identity is product_type_attributes.variant_defining.';
COMMENT ON COLUMN attribute_definitions.filterable IS
  'Legacy compatibility hint only. Authoritative filterability is product_type_attributes.filterable.';
COMMENT ON COLUMN attribute_definitions.values IS
  'Legacy compatibility payload. Controlled values are normalized in attribute_values.';

CREATE TABLE attribute_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attribute_id, code),
  UNIQUE (id, attribute_id),
  CHECK (length(btrim(code)) > 0)
);

CREATE TABLE attribute_value_translations (
  attribute_value_id uuid NOT NULL REFERENCES attribute_values(id) ON DELETE CASCADE,
  locale text NOT NULL,
  label text NOT NULL,
  PRIMARY KEY (attribute_value_id, locale),
  CHECK (length(btrim(locale)) > 0),
  CHECK (length(btrim(label)) > 0)
);

CREATE TABLE attribute_value_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  attribute_value_id uuid NOT NULL,
  locale text,
  source_namespace text NOT NULL DEFAULT 'catalog',
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (attribute_value_id, attribute_id)
    REFERENCES attribute_values(id, attribute_id) ON DELETE CASCADE,
  UNIQUE (attribute_id, source_namespace, locale, normalized_alias),
  CHECK (length(btrim(alias)) > 0),
  CHECK (length(btrim(normalized_alias)) > 0)
);
CREATE INDEX attribute_value_aliases_value_idx
  ON attribute_value_aliases(attribute_value_id, locale);

-- ---------------------------------------------------------------------------
-- Contextual Product Type attribute rules
-- ---------------------------------------------------------------------------
CREATE TABLE product_type_attributes (
  product_type_id uuid NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  requirement_level text NOT NULL DEFAULT 'optional'
    CHECK (requirement_level IN ('required','recommended','optional')),
  value_level text NOT NULL
    CHECK (value_level IN ('family','variant')),
  filterable boolean NOT NULL DEFAULT false,
  searchable boolean NOT NULL DEFAULT false,
  customer_visible boolean NOT NULL DEFAULT true,
  comparable boolean NOT NULL DEFAULT false,
  variant_defining boolean NOT NULL DEFAULT false,
  allow_multiple boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  variant_axis_order integer,
  unit_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_type_id, attribute_id),
  CHECK (
    (variant_defining = false AND variant_axis_order IS NULL)
    OR
    (variant_defining = true AND value_level = 'variant' AND variant_axis_order IS NOT NULL AND variant_axis_order > 0)
  )
);

CREATE UNIQUE INDEX product_type_attributes_variant_axis_idx
  ON product_type_attributes(product_type_id, variant_axis_order)
  WHERE variant_axis_order IS NOT NULL;
CREATE INDEX product_type_attributes_attribute_idx
  ON product_type_attributes(attribute_id, product_type_id);

CREATE TABLE product_type_attribute_allowed_values (
  product_type_id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  attribute_value_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_type_id, attribute_id, attribute_value_id),
  FOREIGN KEY (product_type_id, attribute_id)
    REFERENCES product_type_attributes(product_type_id, attribute_id) ON DELETE CASCADE,
  FOREIGN KEY (attribute_value_id, attribute_id)
    REFERENCES attribute_values(id, attribute_id) ON DELETE CASCADE
);

COMMENT ON TABLE product_type_attributes IS
  'Authoritative contextual attribute behavior: requirement, storage level, filtering, visibility and variant-axis identity for each Product Type.';
COMMENT ON TABLE product_type_attribute_allowed_values IS
  'Optional controlled-value subset for a Product Type attribute. No rows means all active values on the Attribute are eligible.';

-- ---------------------------------------------------------------------------
-- Typed family / variant values. JSON source payloads remain for provenance.
-- ---------------------------------------------------------------------------
CREATE TABLE product_family_attribute_values (
  family_id uuid NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  attribute_value_id uuid,
  text_value text,
  number_value numeric,
  boolean_value boolean,
  dimension_value jsonb,
  source text NOT NULL DEFAULT 'catalog_admin'
    CHECK (source IN ('catalog_admin','vendor_submission','import','matching','enrichment','migration')),
  confidence numeric(6,5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, attribute_id, position),
  FOREIGN KEY (attribute_value_id, attribute_id)
    REFERENCES attribute_values(id, attribute_id),
  CHECK (num_nonnulls(attribute_value_id,text_value,number_value,boolean_value,dimension_value) = 1),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE canonical_variant_attribute_values (
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  attribute_value_id uuid,
  text_value text,
  number_value numeric,
  boolean_value boolean,
  dimension_value jsonb,
  source text NOT NULL DEFAULT 'catalog_admin'
    CHECK (source IN ('catalog_admin','vendor_submission','import','matching','enrichment','migration')),
  confidence numeric(6,5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_variant_id, attribute_id, position),
  FOREIGN KEY (attribute_value_id, attribute_id)
    REFERENCES attribute_values(id, attribute_id),
  CHECK (num_nonnulls(attribute_value_id,text_value,number_value,boolean_value,dimension_value) = 1),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX product_family_attribute_values_attribute_idx
  ON product_family_attribute_values(attribute_id, family_id);
CREATE INDEX canonical_variant_attribute_values_attribute_idx
  ON canonical_variant_attribute_values(attribute_id, canonical_variant_id);

-- One validation function protects both normalized value tables.
CREATE OR REPLACE FUNCTION bls_private.validate_product_attribute_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_product_type_id uuid;
  rule_level text;
  rule_allow_multiple boolean;
  attribute_data_type text;
  has_allowed_subset boolean;
  controlled_value_allowed boolean;
BEGIN
  IF TG_TABLE_NAME = 'product_family_attribute_values' THEN
    SELECT pf.product_type_id INTO resolved_product_type_id
    FROM public.product_families pf
    WHERE pf.id = NEW.family_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product family does not exist';
    END IF;
  ELSE
    SELECT pf.product_type_id INTO resolved_product_type_id
    FROM public.canonical_variants cv
    JOIN public.product_families pf ON pf.id = cv.family_id
    WHERE cv.id = NEW.canonical_variant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'canonical variant or product family does not exist';
    END IF;
  END IF;

  IF resolved_product_type_id IS NULL THEN
    RAISE EXCEPTION 'product family must have a Product Type before normalized attributes can be assigned';
  END IF;

  SELECT pta.value_level, pta.allow_multiple, ad.data_type
  INTO rule_level, rule_allow_multiple, attribute_data_type
  FROM public.product_type_attributes pta
  JOIN public.attribute_definitions ad ON ad.id = pta.attribute_id
  WHERE pta.product_type_id = resolved_product_type_id
    AND pta.attribute_id = NEW.attribute_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attribute % is not allowed for Product Type %', NEW.attribute_id, resolved_product_type_id;
  END IF;

  IF TG_TABLE_NAME = 'product_family_attribute_values' AND rule_level <> 'family' THEN
    RAISE EXCEPTION 'attribute must be stored at variant level for this Product Type';
  END IF;
  IF TG_TABLE_NAME = 'canonical_variant_attribute_values' AND rule_level <> 'variant' THEN
    RAISE EXCEPTION 'attribute must be stored at family level for this Product Type';
  END IF;

  IF NOT rule_allow_multiple AND NEW.position <> 0 THEN
    RAISE EXCEPTION 'attribute is single-valued for this Product Type';
  END IF;

  IF NEW.attribute_value_id IS NOT NULL THEN
    IF attribute_data_type NOT IN ('enum','multienum') THEN
      RAISE EXCEPTION 'controlled attribute value can only be used for enum/multienum attributes';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.product_type_attribute_allowed_values av
      WHERE av.product_type_id = resolved_product_type_id
        AND av.attribute_id = NEW.attribute_id
    ) INTO has_allowed_subset;

    IF has_allowed_subset THEN
      SELECT EXISTS (
        SELECT 1 FROM public.product_type_attribute_allowed_values av
        WHERE av.product_type_id = resolved_product_type_id
          AND av.attribute_id = NEW.attribute_id
          AND av.attribute_value_id = NEW.attribute_value_id
      ) INTO controlled_value_allowed;

      IF NOT controlled_value_allowed THEN
        RAISE EXCEPTION 'controlled value is not allowed for this Product Type attribute';
      END IF;
    END IF;
  ELSIF NEW.text_value IS NOT NULL THEN
    IF attribute_data_type <> 'text' THEN
      RAISE EXCEPTION 'text value does not match attribute data type %', attribute_data_type;
    END IF;
  ELSIF NEW.number_value IS NOT NULL THEN
    IF attribute_data_type <> 'number' THEN
      RAISE EXCEPTION 'number value does not match attribute data type %', attribute_data_type;
    END IF;
  ELSIF NEW.boolean_value IS NOT NULL THEN
    IF attribute_data_type <> 'boolean' THEN
      RAISE EXCEPTION 'boolean value does not match attribute data type %', attribute_data_type;
    END IF;
  ELSIF NEW.dimension_value IS NOT NULL THEN
    IF attribute_data_type <> 'dimension' THEN
      RAISE EXCEPTION 'dimension value does not match attribute data type %', attribute_data_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER product_family_attribute_values_validate
  BEFORE INSERT OR UPDATE ON product_family_attribute_values
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_product_attribute_value();
CREATE TRIGGER canonical_variant_attribute_values_validate
  BEFORE INSERT OR UPDATE ON canonical_variant_attribute_values
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_product_attribute_value();

-- ---------------------------------------------------------------------------
-- Normalize existing embedded enum definitions without deleting legacy JSON.
-- ---------------------------------------------------------------------------
UPDATE attribute_definitions
SET value_mode = CASE WHEN data_type IN ('enum','multienum') THEN 'controlled' ELSE 'free' END,
    updated_at = now();

INSERT INTO attribute_values(attribute_id, code, sort_order)
SELECT ad.id,
       CASE ad.code
         WHEN 'connector' THEN lower(replace(replace(v.value, ' ', '-'), '_', '-'))
         ELSE lower(v.value)
       END,
       v.ordinality::integer * 10
FROM attribute_definitions ad
CROSS JOIN LATERAL jsonb_array_elements_text(ad.values) WITH ORDINALITY AS v(value, ordinality)
WHERE ad.data_type IN ('enum','multienum')
ON CONFLICT (attribute_id, code) DO NOTHING;

-- RLS: catalogue governance tables are mutated by trusted application runtime.
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_type_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribute_value_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribute_value_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_type_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_type_attribute_allowed_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_family_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_variant_attribute_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY bls_platform_runtime_all ON product_types
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON product_type_translations
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON category_product_types
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON attribute_values
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON attribute_value_translations
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON attribute_value_aliases
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON product_type_attributes
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON product_type_attribute_allowed_values
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON product_family_attribute_values
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY bls_platform_runtime_all ON canonical_variant_attribute_values
  FOR ALL USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMIT;

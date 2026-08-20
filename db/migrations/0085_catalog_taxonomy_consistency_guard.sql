BEGIN;

-- Normalize legacy generic nodes into navigation-only branches and enforce
-- product assignment exclusively at active product_class leaves.
INSERT INTO categories (
  market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
  require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,
  advice_allowed,checkout_fulfilment_modes,taxonomy_role,assignable,discoverable,sort_order,updated_at
)
SELECT
  p.market_id,p.id,'other-toys','other-toys',p.commerce_mode,true,p.filter_schema,p.sort_config,
  p.require_compatibility_confirmation,p.regulated_checkout_allowed,p.counteroffer_allowed,
  p.advice_allowed,p.checkout_fulfilment_modes,'product_class',true,true,999,now()
FROM categories p
WHERE p.code='toys'
  AND NOT EXISTS (
    SELECT 1 FROM categories x WHERE x.market_id IS NOT DISTINCT FROM p.market_id AND x.code='other-toys'
  );

UPDATE categories c
SET parent_id=p.id,taxonomy_role='product_class',assignable=true,discoverable=true,active=true,updated_at=now()
FROM categories p
WHERE c.code='other-toys' AND p.code='toys' AND c.market_id IS NOT DISTINCT FROM p.market_id;

INSERT INTO category_translations(category_id,locale,name,description)
SELECT c.id,v.locale,v.name,v.description
FROM categories c
CROSS JOIN (VALUES
  ('el','Λοιπά παιχνίδια','Παιχνίδια που δεν ανήκουν ακόμη σε ειδικότερη κλάση προϊόντος.'),
  ('en','Other toys','Toys not yet covered by a more specific product class.')
) AS v(locale,name,description)
WHERE c.code='other-toys'
ON CONFLICT (category_id,locale) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description;

UPDATE product_families pf
SET category_id=c.id,updated_at=now()
FROM categories c
WHERE c.code='other-toys'
  AND pf.id IN (
    SELECT cv.family_id FROM canonical_variants cv
    WHERE cv.public_id='test_catalog_product_20260818'
  );

UPDATE canonical_variants cv
SET category_id=c.id
FROM categories c
WHERE c.code='other-toys'
  AND cv.public_id='test_catalog_product_20260818';

DELETE FROM category_product_types
WHERE category_id IN (
  SELECT id FROM categories WHERE code IN ('toys-hobbies-games','hunting-fishing-outdoor-goods')
);

UPDATE categories
SET taxonomy_role='navigation_group',assignable=false,updated_at=now()
WHERE code IN ('toys-hobbies-games','hunting-fishing-outdoor-goods');

WITH moves(child_code,parent_code) AS (
  VALUES
    ('agricultural-hand-tools','agricultural-supplies-machinery'),
    ('irrigation-watering','agricultural-supplies-machinery'),
    ('greenhouse-growing-supplies','agricultural-supplies-machinery'),
    ('camping-outdoor-equipment','hunting-fishing-outdoor-goods'),
    ('fishing-equipment','hunting-fishing-outdoor-goods')
)
UPDATE categories child
SET parent_id=parent.id,updated_at=now()
FROM moves m
JOIN categories parent ON parent.code=m.parent_code
WHERE child.code=m.child_code;

UPDATE categories
SET discoverable=false,updated_at=now()
WHERE taxonomy_role='merchant_legacy'
  AND code IN ('pharmacies','tobacco-smoking-goods');

CREATE OR REPLACE FUNCTION bls_private.validate_product_leaf_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  category_active boolean;
  category_assignable boolean;
  category_role text;
  family_category uuid;
BEGIN
  SELECT active,assignable,taxonomy_role
  INTO category_active,category_assignable,category_role
  FROM public.categories
  WHERE id=NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product category % does not exist', NEW.category_id;
  END IF;

  IF NOT category_active OR NOT category_assignable OR category_role <> 'product_class' THEN
    RAISE EXCEPTION 'products can only be assigned to active assignable product_class taxonomy leaves (category %)', NEW.category_id;
  END IF;

  IF TG_TABLE_NAME='canonical_variants' AND NEW.family_id IS NOT NULL THEN
    SELECT category_id INTO family_category
    FROM public.product_families
    WHERE id=NEW.family_id;

    IF FOUND AND family_category IS DISTINCT FROM NEW.category_id THEN
      RAISE EXCEPTION 'canonical variant category must match its product family category';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_families_leaf_category_validate ON product_families;
CREATE TRIGGER product_families_leaf_category_validate
  BEFORE INSERT OR UPDATE OF category_id ON product_families
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_product_leaf_category();

DROP TRIGGER IF EXISTS canonical_variants_leaf_category_validate ON canonical_variants;
CREATE TRIGGER canonical_variants_leaf_category_validate
  BEFORE INSERT OR UPDATE OF category_id ON canonical_variants
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_product_leaf_category();

COMMIT;

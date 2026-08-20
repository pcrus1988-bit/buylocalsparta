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
  SELECT active, assignable, taxonomy_role
  INTO category_active, category_assignable, category_role
  FROM public.categories
  WHERE id = NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product category % does not exist', NEW.category_id;
  END IF;

  IF NOT category_active OR NOT category_assignable OR category_role <> 'product_class' THEN
    RAISE EXCEPTION 'products can only be assigned to active assignable product_class taxonomy leaves (category %)', NEW.category_id;
  END IF;

  -- This function is shared by product_families and canonical_variants.
  -- Keep canonical-variant-only fields in a separate PL/pgSQL statement so
  -- PostgreSQL never resolves NEW.family_id for a product_families row.
  IF TG_TABLE_NAME = 'canonical_variants' THEN
    IF NEW.family_id IS NOT NULL THEN
      SELECT category_id INTO family_category
      FROM public.product_families
      WHERE id = NEW.family_id;

      IF FOUND AND family_category IS DISTINCT FROM NEW.category_id THEN
        RAISE EXCEPTION 'canonical variant category must match its product family category';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

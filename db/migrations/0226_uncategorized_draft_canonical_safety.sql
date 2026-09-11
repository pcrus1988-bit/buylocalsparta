-- KONTA MOY — uncategorized draft canonical safety.
-- Completes the simplified catalogue policy by allowing inactive draft canonicals
-- to remain family-less until taxonomy organisation assigns a valid category.

BEGIN;

ALTER TABLE public.canonical_variants
  ALTER COLUMN family_id DROP NOT NULL;

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
  IF TG_TABLE_NAME='canonical_variants' THEN
    IF NEW.category_id IS NULL THEN
      IF NEW.active THEN
        RAISE EXCEPTION 'uncategorized canonical variants must remain inactive';
      END IF;
      IF NEW.family_id IS NOT NULL THEN
        RAISE EXCEPTION 'uncategorized canonical variants cannot belong to a product family';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

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

  IF TG_TABLE_NAME='canonical_variants' THEN
    IF NEW.family_id IS NOT NULL THEN
      SELECT category_id INTO family_category
      FROM public.product_families
      WHERE id=NEW.family_id;

      IF FOUND AND family_category IS DISTINCT FROM NEW.category_id THEN
        RAISE EXCEPTION 'canonical variant category must match its product family category';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION bls_private.ensure_canonical_variant_family()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,bls_private
AS $$
BEGIN
  -- Simplified catalogue imports may create an inactive canonical before taxonomy
  -- enrichment is complete. Do not manufacture a family until a category exists.
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.family_id IS NULL THEN
    IF NEW.model IS NOT NULL OR NEW.brand_id IS NOT NULL THEN
      SELECT pf.id INTO NEW.family_id
      FROM public.product_families pf
      WHERE pf.market_id=NEW.market_id
        AND pf.category_id=NEW.category_id
        AND pf.brand_id IS NOT DISTINCT FROM NEW.brand_id
        AND bls_private.catalog_normalize_text(pf.model)=bls_private.catalog_normalize_text(NEW.model)
        AND pf.active=true
      ORDER BY pf.created_at
      LIMIT 1;
    END IF;

    IF NEW.family_id IS NULL THEN
      INSERT INTO public.product_families(
        id,public_id,market_id,brand_id,category_id,model,active,created_at,updated_at
      )
      VALUES(
        gen_random_uuid(),'pf_'||gen_random_uuid()::text,NEW.market_id,NEW.brand_id,
        NEW.category_id,NEW.model,true,now(),now()
      )
      RETURNING id INTO NEW.family_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION bls_private.ensure_canonical_variant_family()
  TO bls_app_runtime,bls_platform_runtime;

COMMENT ON FUNCTION bls_private.ensure_canonical_variant_family() IS
  'Creates or reuses a product family only after a canonical has a valid category. Uncategorized inactive draft canonicals remain family-less until taxonomy enrichment.';

COMMIT;

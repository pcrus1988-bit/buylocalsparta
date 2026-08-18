-- Buy Local Sparta — catalogue taxonomy foundations
-- Additive migration: preserves all existing category and canonical variant IDs.

BEGIN;

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS taxonomy_role text NOT NULL DEFAULT 'category',
  ADD COLUMN IF NOT EXISTS assignable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discoverable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_taxonomy_role_check'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_taxonomy_role_check
      CHECK (taxonomy_role IN ('department','navigation_group','category','subcategory','product_class','merchant_legacy'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_assignable_role_check'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_assignable_role_check
      CHECK (NOT assignable OR taxonomy_role IN ('category','subcategory','product_class'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_parent_not_self_check'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_parent_not_self_check
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

-- Semantic backfill. Depth is deliberately not used as meaning: roots are departments,
-- current branching nodes are navigation groups, and existing leaves remain assignable
-- until a deeper product taxonomy is seeded/reconciled.
UPDATE categories
SET taxonomy_role = 'department',
    assignable = false,
    discoverable = true,
    updated_at = now()
WHERE parent_id IS NULL;

UPDATE categories c
SET taxonomy_role = 'navigation_group',
    assignable = false,
    discoverable = true,
    updated_at = now()
WHERE c.parent_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = c.id);

UPDATE categories
SET taxonomy_role = 'merchant_legacy',
    assignable = false,
    discoverable = true,
    updated_at = now()
WHERE code IN ('pharmacies','tobacco-smoking-goods');

UPDATE categories
SET taxonomy_role = 'product_class',
    assignable = true,
    discoverable = true,
    updated_at = now()
WHERE code IN ('fashion-womens-dresses','fashion-womens-shirts','fashion-womens-tops');

CREATE INDEX IF NOT EXISTS categories_parent_sort_idx
  ON categories(parent_id, sort_order, code);
CREATE INDEX IF NOT EXISTS categories_discovery_idx
  ON categories(market_id, discoverable, active, sort_order, code);
CREATE INDEX IF NOT EXISTS categories_assignable_idx
  ON categories(market_id, assignable, active, code)
  WHERE assignable = true;

-- Prevent cycles and cross-market parentage while retaining the recursive table design.
CREATE OR REPLACE FUNCTION bls_private.validate_category_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_market uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'category cannot be its own parent';
  END IF;

  SELECT market_id INTO parent_market
  FROM public.categories
  WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'category parent % does not exist', NEW.parent_id;
  END IF;

  IF NEW.market_id IS DISTINCT FROM parent_market THEN
    RAISE EXCEPTION 'category and parent must belong to the same market';
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id
      FROM public.categories
      WHERE id = NEW.parent_id
      UNION ALL
      SELECT c.id, c.parent_id
      FROM public.categories c
      JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'category hierarchy cycle detected';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_validate_parent ON categories;
CREATE TRIGGER categories_validate_parent
  BEFORE INSERT OR UPDATE OF parent_id, market_id ON categories
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_category_parent();

COMMENT ON COLUMN categories.taxonomy_role IS
  'Semantic purpose of the taxonomy node; never infer meaning from tree depth.';
COMMENT ON COLUMN categories.assignable IS
  'Whether a canonical product may use this node as a direct catalogue classification.';
COMMENT ON COLUMN categories.discoverable IS
  'Whether the node may appear in customer-facing browse/navigation experiences.';
COMMENT ON COLUMN categories.sort_order IS
  'Stable sibling ordering hint for browse/navigation; lower values appear first.';

-- Primary category remains canonical_variants.category_id for backwards compatibility.
-- This table adds additional discovery/classification placements without duplicating
-- the primary-category source of truth.
CREATE TABLE IF NOT EXISTS canonical_variant_category_assignments (
  canonical_variant_id uuid NOT NULL REFERENCES canonical_variants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  assignment_type text NOT NULL DEFAULT 'secondary'
    CHECK (assignment_type IN ('secondary','merchandising')),
  source text NOT NULL DEFAULT 'catalog_admin'
    CHECK (source IN ('catalog_admin','catalog_matching','vendor_submission','import','merchandising')),
  confidence numeric(6,5),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_variant_id, category_id, assignment_type),
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX IF NOT EXISTS canonical_variant_category_assignments_category_idx
  ON canonical_variant_category_assignments(category_id, assignment_type, canonical_variant_id);

CREATE OR REPLACE FUNCTION bls_private.validate_variant_category_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  variant_market uuid;
  primary_category uuid;
  category_market uuid;
  category_assignable boolean;
BEGIN
  SELECT market_id, category_id INTO variant_market, primary_category
  FROM public.canonical_variants
  WHERE id = NEW.canonical_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical variant % does not exist', NEW.canonical_variant_id;
  END IF;

  SELECT market_id, assignable INTO category_market, category_assignable
  FROM public.categories
  WHERE id = NEW.category_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'category % does not exist', NEW.category_id;
  END IF;

  IF variant_market IS DISTINCT FROM category_market THEN
    RAISE EXCEPTION 'canonical variant and category must belong to the same market';
  END IF;

  IF NEW.assignment_type = 'secondary' AND NEW.category_id = primary_category THEN
    RAISE EXCEPTION 'secondary category cannot duplicate the canonical variant primary category';
  END IF;

  IF NEW.assignment_type = 'secondary' AND NOT category_assignable THEN
    RAISE EXCEPTION 'secondary category must be directly assignable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canonical_variant_category_assignment_validate
  ON canonical_variant_category_assignments;
CREATE TRIGGER canonical_variant_category_assignment_validate
  BEFORE INSERT OR UPDATE OF canonical_variant_id, category_id, assignment_type
  ON canonical_variant_category_assignments
  FOR EACH ROW EXECUTE FUNCTION bls_private.validate_variant_category_assignment();

ALTER TABLE canonical_variant_category_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON canonical_variant_category_assignments;
CREATE POLICY bls_platform_runtime_all ON canonical_variant_category_assignments
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

COMMENT ON TABLE canonical_variant_category_assignments IS
  'Additional catalogue placements for a canonical variant. canonical_variants.category_id remains the primary category source of truth.';

COMMIT;

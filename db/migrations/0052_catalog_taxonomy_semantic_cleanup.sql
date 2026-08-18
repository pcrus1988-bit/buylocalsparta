-- Buy Local Sparta — final Phase 2 taxonomy semantic cleanup.
-- Broad parents become navigation-only once dedicated assignable child classes exist.

BEGIN;

UPDATE categories c
SET taxonomy_role = 'navigation_group',
    assignable = false,
    updated_at = now()
WHERE c.code = 'agricultural-supplies-machinery'
  AND EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id = c.id);

COMMIT;

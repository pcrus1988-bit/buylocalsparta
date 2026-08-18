-- Buy Local Sparta — reclassify existing demo book catalogue into the new retail taxonomy.
-- No family, variant or offer IDs are replaced.

BEGIN;

-- The current demo set consists of children's / young-reader fiction.
UPDATE product_families pf
SET category_id = target.id,
    updated_at = now()
FROM categories target
WHERE target.code = 'children-books'
  AND pf.id IN (
    SELECT cv.family_id
    FROM canonical_variants cv
    JOIN categories current_category ON current_category.id = cv.category_id
    WHERE current_category.code = 'books-stationery-office'
      AND cv.variant_attributes @> '{"demo_product":true}'::jsonb
  );

UPDATE canonical_variants cv
SET category_id = target.id,
    updated_at = now()
FROM categories target
WHERE target.code = 'children-books'
  AND EXISTS (
    SELECT 1
    FROM categories current_category
    WHERE current_category.id = cv.category_id
      AND current_category.code = 'books-stationery-office'
  )
  AND cv.variant_attributes @> '{"demo_product":true}'::jsonb;

-- Fiction is a useful secondary discovery route for the same canonical books.
INSERT INTO canonical_variant_category_assignments(
  canonical_variant_id, category_id, assignment_type, source, confidence
)
SELECT cv.id, fiction.id, 'secondary', 'catalog_admin', 1.00000
FROM canonical_variants cv
JOIN categories primary_category ON primary_category.id = cv.category_id
JOIN categories fiction ON fiction.market_id IS NOT DISTINCT FROM cv.market_id
                       AND fiction.code = 'fiction-books'
WHERE primary_category.code = 'children-books'
  AND cv.variant_attributes @> '{"demo_product":true}'::jsonb
ON CONFLICT (canonical_variant_id, category_id, assignment_type) DO UPDATE
SET source = EXCLUDED.source,
    confidence = EXCLUDED.confidence;

-- The former merchant-style bucket now acts only as a browse/navigation parent once
-- no canonical product or vendor submission points directly at it.
UPDATE categories c
SET taxonomy_role = 'navigation_group',
    assignable = false,
    updated_at = now()
WHERE c.code = 'books-stationery-office'
  AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id = c.id);

COMMIT;

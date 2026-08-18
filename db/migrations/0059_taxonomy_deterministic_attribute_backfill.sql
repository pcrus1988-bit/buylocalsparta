-- Buy Local Sparta — deterministic normalized attributes implied by unambiguous taxonomy.
-- No probabilistic enrichment: only facts encoded directly in the assigned category path.

BEGIN;

-- Existing women’s apparel categories deterministically imply gender=women.
INSERT INTO product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT DISTINCT
  pf.id,ad.id,0,av.id,'migration',1.00000
FROM product_families pf
JOIN categories c ON c.id=pf.category_id
JOIN product_types pt ON pt.id=pf.product_type_id
JOIN attribute_definitions ad ON ad.code='gender'
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code='women'
WHERE pt.code IN ('apparel','dress','shirt','top')
  AND (
    c.code LIKE 'fashion-womens-%'
    OR c.code='womens-clothing'
  )
ON CONFLICT (family_id,attribute_id,position) DO NOTHING;

COMMIT;

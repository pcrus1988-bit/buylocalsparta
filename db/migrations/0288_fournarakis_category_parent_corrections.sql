-- Correct Fournarakis leaf placement without discarding supplier leaf detail.
-- The leaf categories remain stable canonical categories; only their consumer-facing parent is corrected.

BEGIN;

WITH corrections(child_code,parent_code) AS (
  VALUES
    ('fournarakis_leaf_8ef44819197ab229','bathroom-accessories'),
    ('fournarakis_leaf_afb1a0e6d7131928','faucets-showers'),
    ('fournarakis_leaf_f370f8c1ad0e63bc','door-window-hardware'),
    ('fournarakis_leaf_5ca781c3cb6be664','door-window-hardware'),
    ('fournarakis_leaf_0c19afd3e146ffbf','door-window-hardware'),
    ('fournarakis_leaf_532ca91ce8b47b0e','door-window-hardware'),
    ('fournarakis_leaf_7098efe7a3b40457','door-window-hardware'),
    ('fournarakis_leaf_ed969198d3f40047','kitchen-dining-homeware'),
    ('fournarakis_leaf_577933a03c40ad89','cleaning-household-accessories')
)
UPDATE public.categories child
SET parent_id=parent.id,
    updated_at=now()
FROM corrections x
JOIN public.categories parent
  ON parent.code=x.parent_code
WHERE child.code=x.child_code
  AND child.market_id=parent.market_id;

COMMIT;

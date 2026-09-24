-- Refine Fournarakis consumer-facing parent placement after the first catalogue hierarchy cleanup.
-- Supplier leaf/group detail stays intact; only reusable KONTA MOY parent classes and missing labels are corrected.

BEGIN;

WITH corrections(child_code,parent_code) AS (
  VALUES
    ('fournarakis_group_4aee94d3e1bc8dcf','agricultural-machinery-accessories'),
    ('fournarakis_group_a862d9d21888738a','automotive-accessories')
)
UPDATE public.categories child
SET parent_id=parent.id,
    updated_at=now()
FROM corrections x
JOIN public.categories parent
  ON parent.code=x.parent_code
WHERE child.code=x.child_code
  AND child.market_id=parent.market_id;

INSERT INTO public.category_translations(category_id,locale,name)
SELECT c.id,v.locale,v.name
FROM public.categories c
CROSS JOIN (
  VALUES
    ('el'::text,'Καθαριστικά & εργαλεία βαφής'::text),
    ('en'::text,'Paint cleaning tools'::text)
) AS v(locale,name)
WHERE c.code='paint-decorating-cleaning-tools'
ON CONFLICT (category_id,locale) DO UPDATE
SET name=EXCLUDED.name;

COMMIT;

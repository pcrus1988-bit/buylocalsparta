-- KONTA MOY — official adidas kids footwear sizing knowledge.
-- Adds toddler/child/youth heel-to-toe rows and keeps them audience-scoped
-- so adult/unisex sizing cannot be used as the primary guide for kids.

BEGIN;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES (
  'adidas_kids_footwear_size_guide_official',
  'brand_size_guide',
  'adidas',
  'adidas Kids Shoes Size Chart',
  'https://www.adidas.com/us/help/size_charts/kids-shoes',
  now(),
  jsonb_build_object(
    'measurementBasis','heel-to-toe',
    'audience','kids',
    'ageBands',ARRAY['0-3','4-7','8-16'],
    'systems',ARRAY['EU','UK','US'],
    'measurementAdvice','Measure from the heel to the longest toe and compare both feet with the kids chart.'
  )
)
ON CONFLICT (source_key) DO UPDATE SET
  source_type=EXCLUDED.source_type,
  publisher=EXCLUDED.publisher,
  title=EXCLUDED.title,
  url=EXCLUDED.url,
  retrieved_at=EXCLUDED.retrieved_at,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.sport_size_guides(
  guide_key,brand_id,source_id,product_role,audience_scope,measurement_basis,guide_version,metadata
)
SELECT
  'adidas_footwear_kids_heel_to_toe_v1',
  (SELECT id FROM public.brands WHERE lower(name)='adidas' ORDER BY id LIMIT 1),
  s.id,
  'footwear',
  'kids',
  'heel_to_toe_mm',
  '2026-10-02',
  jsonb_build_object(
    'betweenSizesPolicy','return_both_adjacent_sizes',
    'ageBands',ARRAY['babies_toddlers_0_3','children_4_7','youth_teens_8_16'],
    'doNotApplyAdultGuideWhenKidsGuideExists',true,
    'doNotApplyModelFitAdjustmentWithoutProductEvidence',true
  )
FROM public.sport_knowledge_sources s
WHERE s.source_key='adidas_kids_footwear_size_guide_official'
ON CONFLICT (guide_key) DO UPDATE SET
  brand_id=EXCLUDED.brand_id,
  source_id=EXCLUDED.source_id,
  product_role=EXCLUDED.product_role,
  audience_scope=EXCLUDED.audience_scope,
  measurement_basis=EXCLUDED.measurement_basis,
  guide_version=EXCLUDED.guide_version,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.sport_size_guide_translations(guide_id,locale,title,measurement_help)
SELECT
  g.id,
  'el',
  'Οδηγός παιδικών μεγεθών υποδημάτων adidas',
  'Βάλε το παιδί να σταθεί σε χαρτί με τη φτέρνα κοντά σε τοίχο, σημείωσε το μακρύτερο δάχτυλο και μέτρησε και τα δύο πέλματα. Αν η μέτρηση είναι ανάμεσα σε δύο γραμμές, εμφάνισε και τις δύο γειτονικές επιλογές.'
FROM public.sport_size_guides g
WHERE g.guide_key='adidas_footwear_kids_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

INSERT INTO public.sport_size_guide_translations(guide_id,locale,title,measurement_help)
SELECT
  g.id,
  'en',
  'adidas kids footwear size guide',
  'Have the child stand on paper with the heel near a wall, mark the longest toe and measure both feet. If the measurement falls between chart rows, return both adjacent size choices.'
FROM public.sport_size_guides g
WHERE g.guide_key='adidas_footwear_kids_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

CREATE TEMP TABLE _sport_308_kids_size_seed (
  position integer PRIMARY KEY,
  heel_to_toe_mm numeric(7,2) NOT NULL,
  eu text NOT NULL,
  uk text NOT NULL,
  us text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_308_kids_size_seed VALUES
(1,81,'16','0k','1k'),
(2,90,'17','1k','2k'),
(3,98,'18','2k','3k'),
(4,106,'19','3k','4k'),
(5,115,'20','4k','5k'),
(6,123,'21','5k','5.5k'),
(7,128,'22','5.5k','6k'),
(8,132,'23','6k','6.5k'),
(9,136,'23.5','6.5k','7k'),
(10,140,'24','7k','7.5k'),
(11,145,'25','7.5k','8k'),
(12,149,'25.5','8k','8.5k'),
(13,153,'26','8.5k','9k'),
(14,157,'26.5','9k','9.5k'),
(15,161,'27','9.5k','10k'),
(16,166,'28','10k','10.5k'),
(17,170,'28.5','10.5k','11k'),
(18,174,'29','11k','11.5k'),
(19,178,'30','11.5k','12k'),
(20,183,'30.5','12k','12.5k'),
(21,187,'31','12.5k','13k'),
(22,191,'31.5','13k','13.5k'),
(23,195,'32','13.5k','1'),
(24,200,'33','1','1.5'),
(25,204,'33.5','1.5','2'),
(26,208,'34','2','2.5'),
(27,212,'35','2.5','3'),
(28,216,'35.5','3','3.5'),
(29,221,'36','3.5','4'),
(30,225,'36 2/3','4','4.5'),
(31,229,'37 1/3','4.5','5'),
(32,233,'38','5','5.5'),
(33,238,'38 2/3','5.5','6'),
(34,242,'39 1/3','6','6.5'),
(35,246,'40','6.5','7'),
(36,250,'40 2/3','7','7.5');

INSERT INTO public.sport_size_guide_entries(
  guide_id,position,measurement_mm
)
SELECT g.id,s.position,s.heel_to_toe_mm
FROM _sport_308_kids_size_seed s
JOIN public.sport_size_guides g
  ON g.guide_key='adidas_footwear_kids_heel_to_toe_v1'
ON CONFLICT (guide_id,position) DO UPDATE SET
  measurement_mm=EXCLUDED.measurement_mm,
  updated_at=now();

WITH label_seed AS (
  SELECT position,'EU'::text AS size_system,eu AS size_label FROM _sport_308_kids_size_seed
  UNION ALL
  SELECT position,'UK',uk FROM _sport_308_kids_size_seed
  UNION ALL
  SELECT position,'US',us FROM _sport_308_kids_size_seed
)
INSERT INTO public.sport_size_guide_labels(
  entry_id,size_system,audience_scope,size_label
)
SELECT e.id,l.size_system,'kids',l.size_label
FROM label_seed l
JOIN public.sport_size_guides g
  ON g.guide_key='adidas_footwear_kids_heel_to_toe_v1'
JOIN public.sport_size_guide_entries e
  ON e.guide_id=g.id
 AND e.position=l.position
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET
  size_label=EXCLUDED.size_label;

DO $$
DECLARE
  v_entry_count integer;
  v_label_count integer;
BEGIN
  SELECT count(*) INTO v_entry_count
  FROM public.sport_size_guide_entries e
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='adidas_footwear_kids_heel_to_toe_v1';

  SELECT count(*) INTO v_label_count
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='adidas_footwear_kids_heel_to_toe_v1'
    AND l.audience_scope='kids';

  IF v_entry_count<>36 THEN
    RAISE EXCEPTION 'Expected 36 adidas kids size-guide rows, found %',v_entry_count;
  END IF;

  IF v_label_count<>108 THEN
    RAISE EXCEPTION 'Expected 108 adidas kids size-guide labels, found %',v_label_count;
  END IF;
END
$$;

COMMIT;

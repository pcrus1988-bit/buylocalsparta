-- KONTA MOY — official Reebok adult/unisex footwear sizing knowledge.
-- Stores Reebok heel-to-toe measurements and EU/UK/US/JP labels so measured
-- sizing can be resolved locally without an external recommendation API.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.brands WHERE lower(name)='reebok') THEN
    RAISE EXCEPTION 'Reebok brand must exist before Sport & Fit size guide migration 310';
  END IF;
END
$$;

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES (
  'reebok_unisex_footwear_size_guide_official',
  'brand_size_guide',
  'Reebok',
  'Reebok Unisex Shoes Size Guide',
  'https://www.reebok.com/pages/f45-size-guides',
  now(),
  jsonb_build_object(
    'measurementBasis','heel-to-toe',
    'audience','unisex',
    'systems',ARRAY['EU','UK','US-Men','US-Women','JP'],
    'measurementAdvice','Measure heel to longest toe and use the larger foot measurement.'
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
  'reebok_footwear_unisex_heel_to_toe_v1',
  (SELECT id FROM public.brands WHERE lower(name)='reebok' ORDER BY id LIMIT 1),
  s.id,
  'footwear',
  'unisex',
  'heel_to_toe_mm',
  '2026-10-02',
  jsonb_build_object(
    'betweenSizesPolicy','return_both_adjacent_sizes',
    'doNotApplyModelFitAdjustmentWithoutProductEvidence',true
  )
FROM public.sport_knowledge_sources s
WHERE s.source_key='reebok_unisex_footwear_size_guide_official'
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
  'Οδηγός μεγεθών υποδημάτων Reebok',
  'Μέτρησε και τα δύο πέλματα από τη φτέρνα έως το μακρύτερο δάχτυλο και χρησιμοποίησε τη μεγαλύτερη μέτρηση. Αν η μέτρηση πέφτει ανάμεσα σε δύο γραμμές, το ΚΟΝΤΑ ΜΟΥ εμφανίζει και τις δύο γειτονικές επιλογές.'
FROM public.sport_size_guides g
WHERE g.guide_key='reebok_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

INSERT INTO public.sport_size_guide_translations(guide_id,locale,title,measurement_help)
SELECT
  g.id,
  'en',
  'Reebok footwear size guide',
  'Measure both feet from heel to the longest toe and use the larger measurement. When the measurement falls between chart rows, return both adjacent size choices rather than guessing.'
FROM public.sport_size_guides g
WHERE g.guide_key='reebok_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

CREATE TEMP TABLE _sport_310_reebok_size_seed (
  position integer PRIMARY KEY,
  heel_to_toe_mm numeric(7,2) NOT NULL,
  eu text NOT NULL,
  uk text NOT NULL,
  us_men text NOT NULL,
  us_women text NOT NULL,
  jp text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sport_310_reebok_size_seed VALUES
(1,221,'36','3.5','4','5','22.0'),
(2,224,'36.5','4','4.5','5.5','22.5'),
(3,229,'37.5','4.5','5','6','23.0'),
(4,234,'38','5','5.5','6.5','23.5'),
(5,236,'38.5','5.5','6','7','24.0'),
(6,241,'39','6','6.5','7.5','24.5'),
(7,246,'40','6.5','7','8','25.0'),
(8,249,'40.5','7','7.5','8.5','25.5'),
(9,254,'41','7.5','8','9','26.0'),
(10,259,'42','8','8.5','9.5','26.5'),
(11,262,'42.5','8.5','9','10','27.0'),
(12,267,'43','9','9.5','10.5','27.5'),
(13,272,'44','9.5','10','11','28.0'),
(14,274,'44.5','10','10.5','11.5','28.5'),
(15,279,'45','10.5','11','12','29.0'),
(16,284,'45.5','11','11.5','12.5','29.5'),
(17,287,'46.5','11.5','12','13','30.0'),
(18,292,'47','12','12.5','13.5','30.5'),
(19,297,'48','12.5','13','14','31.0'),
(20,300,'48.5','13','13.5','14.5','31.5'),
(21,305,'49','13.5','14','15','32.0');

INSERT INTO public.sport_size_guide_entries(
  guide_id,position,measurement_mm
)
SELECT g.id,s.position,s.heel_to_toe_mm
FROM _sport_310_reebok_size_seed s
JOIN public.sport_size_guides g
  ON g.guide_key='reebok_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,position) DO UPDATE SET
  measurement_mm=EXCLUDED.measurement_mm,
  updated_at=now();

WITH label_seed AS (
  SELECT position,'EU'::text AS size_system,'unisex'::text AS audience_scope,eu AS size_label
  FROM _sport_310_reebok_size_seed
  UNION ALL
  SELECT position,'UK','unisex',uk FROM _sport_310_reebok_size_seed
  UNION ALL
  SELECT position,'US','men',us_men FROM _sport_310_reebok_size_seed
  UNION ALL
  SELECT position,'US','women',us_women FROM _sport_310_reebok_size_seed
  UNION ALL
  SELECT position,'JP','unisex',jp FROM _sport_310_reebok_size_seed
)
INSERT INTO public.sport_size_guide_labels(
  entry_id,size_system,audience_scope,size_label
)
SELECT e.id,l.size_system,l.audience_scope,l.size_label
FROM label_seed l
JOIN public.sport_size_guides g
  ON g.guide_key='reebok_footwear_unisex_heel_to_toe_v1'
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
  WHERE g.guide_key='reebok_footwear_unisex_heel_to_toe_v1';

  SELECT count(*) INTO v_label_count
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='reebok_footwear_unisex_heel_to_toe_v1';

  IF v_entry_count<>21 THEN
    RAISE EXCEPTION 'Expected 21 Reebok size-guide rows, found %',v_entry_count;
  END IF;

  IF v_label_count<>105 THEN
    RAISE EXCEPTION 'Expected 105 Reebok size-guide labels, found %',v_label_count;
  END IF;
END
$$;

COMMIT;

BEGIN;

-- Extend the governed Sport & Fit vocabulary for handball and badminton.
-- Vocabulary only: product-level suitability still requires normal governed
-- evidence/provenance before it can influence recommendations.

CREATE TEMP TABLE _sport_fit_325_seed (
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  label_el text NOT NULL,
  label_en text NOT NULL,
  sort_order integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _sport_fit_325_seed VALUES
('sport_activity','handball','Χάντμπολ','Handball',130,'{}'),
('sport_activity','badminton','Μπάντμιντον','Badminton',140,'{}'),

('sport_use_case','handball_training','Προπόνηση χάντμπολ','Handball training',260,'{}'),
('sport_use_case','handball_match','Αγώνας χάντμπολ','Handball match',270,'{}'),
('sport_use_case','badminton_training','Προπόνηση μπάντμιντον','Badminton training',280,'{}'),
('sport_use_case','badminton_match','Αγώνας μπάντμιντον','Badminton match',290,'{}');

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,s.value_code,s.sort_order,s.metadata
FROM _sport_fit_325_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el',s.label_el
FROM _sport_fit_325_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en',s.label_en
FROM _sport_fit_325_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

DO $$
DECLARE
  v_expected integer;
  v_actual integer;
BEGIN
  SELECT count(*) INTO v_expected FROM _sport_fit_325_seed;

  SELECT count(*) INTO v_actual
  FROM _sport_fit_325_seed s
  JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
  JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
  WHERE av.active=true;

  IF v_actual <> v_expected OR v_expected <> 6 THEN
    RAISE EXCEPTION 'Sport & Fit handball/badminton vocabulary incomplete: expected %, found %',v_expected,v_actual;
  END IF;
END
$$;

COMMIT;

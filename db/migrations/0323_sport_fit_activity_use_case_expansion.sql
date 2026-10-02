BEGIN;

-- Extend the governed Sport & Fit vocabulary for first-class outdoor and court-sport paths.
-- This migration adds taxonomy values only. Product-level facts still require the normal
-- evidence/provenance workflow before they can influence recommendations.

CREATE TEMP TABLE _sport_fit_expansion_seed (
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  label_el text NOT NULL,
  label_en text NOT NULL,
  sort_order integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _sport_fit_expansion_seed VALUES
('sport_activity','hiking','Πεζοπορία / outdoor','Hiking / outdoor',70,'{}'),
('sport_activity','basketball','Μπάσκετ','Basketball',80,'{}'),
('sport_activity','tennis','Τένις','Tennis',90,'{}'),
('sport_activity','padel','Padel','Padel',100,'{}'),
('sport_activity','volleyball','Βόλεϊ','Volleyball',110,'{}'),
('sport_activity','racket_sports','Αθλήματα ρακέτας','Racket sports',120,'{}'),

('sport_surface','court_hard','Hard court','Hard court',120,'{}'),
('sport_surface','court_clay','Χώμα / clay court','Clay court',130,'{}'),
('sport_surface','court_indoor','Indoor court','Indoor court',140,'{}'),
('sport_surface','court_outdoor','Outdoor court','Outdoor court',150,'{}'),
('sport_surface','court_artificial','Τεχνητός τάπητας court','Artificial court',160,'{}'),
('sport_surface','sand','Άμμος / beach','Sand / beach',170,'{}'),

('sport_use_case','all_day_standing','Πολύωρη ορθοστασία','All-day standing',120,'{}'),
('sport_use_case','travel_walking','Πολύ περπάτημα / ταξίδι','Travel walking',130,'{}'),
('sport_use_case','gym_functional','Functional / HIIT','Functional / HIIT',140,'{}'),
('sport_use_case','day_hike','Ημερήσια πεζοπορία','Day hike',150,'{}'),
('sport_use_case','technical_hike','Τεχνική / ορεινή πεζοπορία','Technical hike',160,'{}'),
('sport_use_case','urban_outdoor','Outdoor + πόλη / ταξίδι','Urban outdoor',170,'{}'),
('sport_use_case','basketball_training','Προπόνηση μπάσκετ','Basketball training',180,'{}'),
('sport_use_case','basketball_match','Αγώνας μπάσκετ','Basketball match',190,'{}'),
('sport_use_case','tennis_training','Προπόνηση τένις','Tennis training',200,'{}'),
('sport_use_case','tennis_match','Αγώνας τένις','Tennis match',210,'{}'),
('sport_use_case','padel_training','Προπόνηση padel','Padel training',220,'{}'),
('sport_use_case','padel_match','Αγώνας padel','Padel match',230,'{}'),
('sport_use_case','volleyball_training','Προπόνηση βόλεϊ','Volleyball training',240,'{}'),
('sport_use_case','volleyball_match','Αγώνας βόλεϊ','Volleyball match',250,'{}');

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,s.value_code,s.sort_order,s.metadata
FROM _sport_fit_expansion_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el',s.label_el
FROM _sport_fit_expansion_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en',s.label_en
FROM _sport_fit_expansion_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

DO $$
DECLARE
  v_expected integer;
  v_actual integer;
BEGIN
  SELECT count(*) INTO v_expected FROM _sport_fit_expansion_seed;

  SELECT count(*) INTO v_actual
  FROM _sport_fit_expansion_seed s
  JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
  JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
  WHERE av.active=true;

  IF v_actual <> v_expected OR v_expected <> 26 THEN
    RAISE EXCEPTION 'Sport & Fit expansion vocabulary incomplete: expected %, found %',v_expected,v_actual;
  END IF;
END
$$;

COMMIT;

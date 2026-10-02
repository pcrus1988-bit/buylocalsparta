-- KONTA MOY — controlled Sport & Fit vocabulary expansion for outdoor and court sports.
-- Aligns the governed database vocabulary with the deterministic engine's supported
-- hiking, basketball, tennis, padel and volleyball paths. This migration adds only
-- controlled vocabulary; it does not infer any product facts.

BEGIN;

CREATE TEMP TABLE _sport_323_values (
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  label_el text NOT NULL,
  label_en text NOT NULL,
  sort_order integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _sport_323_values VALUES
('sport_activity','basketball','Μπάσκετ','Basketball',70,'{}'),
('sport_activity','tennis','Τένις','Tennis',80,'{}'),
('sport_activity','padel','Padel','Padel',90,'{}'),
('sport_activity','volleyball','Βόλεϊ','Volleyball',100,'{}'),
('sport_activity','racket_sports','Αθλήματα ρακέτας','Racket sports',110,'{}'),
('sport_surface','court_hard','Σκληρό γήπεδο','Hard court',120,'{"courtFamily":"hard"}'),
('sport_surface','court_clay','Χώμα / clay court','Clay court',130,'{"courtFamily":"clay"}'),
('sport_surface','court_indoor','Indoor court','Indoor court',140,'{"courtFamily":"indoor"}'),
('sport_surface','court_outdoor','Outdoor court','Outdoor court',150,'{"courtFamily":"outdoor"}'),
('sport_surface','court_artificial','Συνθετικό court','Artificial court',160,'{"courtFamily":"artificial"}'),
('sport_surface','sand','Άμμος','Sand',170,'{}'),
('sport_use_case','travel_walking','Περπάτημα σε ταξίδι','Travel walking',120,'{}'),
('sport_use_case','gym_functional','Functional / HIIT','Functional / HIIT training',130,'{}'),
('sport_use_case','day_hike','Ημερήσια πεζοπορία','Day hike',140,'{}'),
('sport_use_case','technical_hike','Τεχνική πεζοπορία','Technical hike',150,'{}'),
('sport_use_case','urban_outdoor','Outdoor στην πόλη','Urban outdoor',160,'{}'),
('sport_use_case','basketball_training','Προπόνηση μπάσκετ','Basketball training',170,'{}'),
('sport_use_case','basketball_match','Αγώνας μπάσκετ','Basketball match',180,'{}'),
('sport_use_case','tennis_training','Προπόνηση τένις','Tennis training',190,'{}'),
('sport_use_case','tennis_match','Αγώνας τένις','Tennis match',200,'{}'),
('sport_use_case','padel_training','Προπόνηση padel','Padel training',210,'{}'),
('sport_use_case','padel_match','Αγώνας padel','Padel match',220,'{}'),
('sport_use_case','volleyball_training','Προπόνηση βόλεϊ','Volleyball training',230,'{}'),
('sport_use_case','volleyball_match','Αγώνας βόλεϊ','Volleyball match',240,'{}');

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,s.value_code,s.sort_order,s.metadata
FROM _sport_323_values s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el',s.label_el
FROM _sport_323_values s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en',s.label_en
FROM _sport_323_values s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

DO $$
DECLARE
  v_activity integer;
  v_surface integer;
  v_use_case integer;
BEGIN
  SELECT count(*) INTO v_activity
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_activity'
    AND av.code IN ('basketball','tennis','padel','volleyball','racket_sports')
    AND av.active;

  SELECT count(*) INTO v_surface
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_surface'
    AND av.code IN ('court_hard','court_clay','court_indoor','court_outdoor','court_artificial','sand')
    AND av.active;

  SELECT count(*) INTO v_use_case
  FROM public.attribute_values av
  JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
  WHERE ad.code='sport_use_case'
    AND av.code IN (
      'travel_walking','gym_functional','day_hike','technical_hike','urban_outdoor',
      'basketball_training','basketball_match',
      'tennis_training','tennis_match',
      'padel_training','padel_match',
      'volleyball_training','volleyball_match'
    )
    AND av.active;

  IF v_activity<>5 OR v_surface<>6 OR v_use_case<>13 THEN
    RAISE EXCEPTION
      'Sport & Fit vocabulary expansion incomplete: activities %, surfaces %, use cases %',
      v_activity,v_surface,v_use_case;
  END IF;
END
$$;

COMMIT;

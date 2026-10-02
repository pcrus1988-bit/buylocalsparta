-- KONTA MOY — governed brand footwear sizing knowledge.
-- Stores manufacturer size charts as normalized measurement rows and size-system labels
-- so Sport & Fit can convert measured heel-to-toe length without external APIs.

BEGIN;

CREATE TABLE public.sport_size_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_key text NOT NULL UNIQUE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  source_id uuid NOT NULL REFERENCES public.sport_knowledge_sources(id) ON DELETE RESTRICT,
  product_role text NOT NULL CHECK (product_role IN ('footwear','sock','apparel','equipment','accessory')),
  audience_scope text NOT NULL CHECK (audience_scope IN ('unisex','men','women','kids')),
  measurement_basis text NOT NULL CHECK (measurement_basis IN ('heel_to_toe_mm','foot_length_mm','body_measurement_mm')),
  guide_version text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(guide_key))>0),
  CHECK (length(btrim(guide_version))>0)
);

CREATE TABLE public.sport_size_guide_translations (
  guide_id uuid NOT NULL REFERENCES public.sport_size_guides(id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL,
  measurement_help text NOT NULL,
  PRIMARY KEY(guide_id,locale),
  CHECK (length(btrim(locale))>0),
  CHECK (length(btrim(title))>0),
  CHECK (length(btrim(measurement_help))>0)
);

CREATE TABLE public.sport_size_guide_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id uuid NOT NULL REFERENCES public.sport_size_guides(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position>=0),
  measurement_mm numeric(7,2) NOT NULL CHECK (measurement_mm>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guide_id,position),
  UNIQUE(guide_id,measurement_mm)
);

CREATE TABLE public.sport_size_guide_labels (
  entry_id uuid NOT NULL REFERENCES public.sport_size_guide_entries(id) ON DELETE CASCADE,
  size_system text NOT NULL,
  audience_scope text NOT NULL CHECK (audience_scope IN ('unisex','men','women','kids')),
  size_label text NOT NULL,
  PRIMARY KEY(entry_id,size_system,audience_scope),
  CHECK (length(btrim(size_system))>0),
  CHECK (length(btrim(size_label))>0)
);

CREATE INDEX sport_size_guides_brand_role_idx
  ON public.sport_size_guides(brand_id,product_role,active);
CREATE INDEX sport_size_guide_entries_measurement_idx
  ON public.sport_size_guide_entries(guide_id,measurement_mm);
CREATE INDEX sport_size_guide_labels_lookup_idx
  ON public.sport_size_guide_labels(size_system,audience_scope,size_label);

COMMENT ON TABLE public.sport_size_guides IS
  'Versioned manufacturer/reference size guides used by Sport & Fit. Guides are source-backed and independent of vendor stock.';
COMMENT ON TABLE public.sport_size_guide_entries IS
  'Measured body/foot dimensions for a size guide. For footwear, measurement_mm is the manufacturer heel-to-toe or foot-length measurement.';
COMMENT ON TABLE public.sport_size_guide_labels IS
  'Normalized labels for one measured size point across EU, UK, US, JP or future size systems.';

INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
)
VALUES (
  'adidas_footwear_size_guide_official',
  'brand_size_guide',
  'adidas',
  'Men and Women adidas Footwear Sizing',
  'https://support.dtb.adidas.com/static-content/size-charts/en_GB/footwear/size-shoes.html',
  now(),
  jsonb_build_object(
    'measurementBasis','heel-to-toe',
    'systems',ARRAY['EU','UK','US-Men','US-Women','JP'],
    'measurementAdvice','Measure both feet from heel to longest toe; adidas recommends measuring at the end of the day.'
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
  'adidas_footwear_unisex_heel_to_toe_v1',
  (SELECT id FROM public.brands WHERE lower(name)='adidas' ORDER BY id LIMIT 1),
  s.id,
  'footwear',
  'unisex',
  'heel_to_toe_mm',
  '2026-10-02',
  jsonb_build_object(
    'betweenSizesPolicy','return_both_adjacent_sizes',
    'tightFitPreference','lower_adjacent_size',
    'looseFitPreference','upper_adjacent_size',
    'doNotApplyModelFitAdjustmentWithoutProductEvidence',true
  )
FROM public.sport_knowledge_sources s
WHERE s.source_key='adidas_footwear_size_guide_official'
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
  'Οδηγός μεγεθών υποδημάτων adidas',
  'Μέτρησε και τα δύο πέλματα από τη φτέρνα έως το μακρύτερο δάχτυλο, κατά προτίμηση στο τέλος της ημέρας. Αν η μέτρηση πέφτει ανάμεσα σε δύο γραμμές, το ΚΟΝΤΑ ΜΟΥ πρέπει να εμφανίζει και τις δύο γειτονικές επιλογές αντί να μαντεύει.'
FROM public.sport_size_guides g
WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

INSERT INTO public.sport_size_guide_translations(guide_id,locale,title,measurement_help)
SELECT
  g.id,
  'en',
  'adidas footwear size guide',
  'Measure both feet from heel to the longest toe, preferably at the end of the day. When the measurement falls between two chart rows, KONTA MOY should return both adjacent choices rather than guessing.'
FROM public.sport_size_guides g
WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,locale) DO UPDATE SET
  title=EXCLUDED.title,
  measurement_help=EXCLUDED.measurement_help;

CREATE TEMP TABLE _sport_306_size_seed (
  position integer PRIMARY KEY,
  heel_to_toe_mm numeric(7,2) NOT NULL,
  eu text NOT NULL,
  uk text NOT NULL,
  us_men text NOT NULL,
  us_women text,
  jp text
) ON COMMIT DROP;

INSERT INTO _sport_306_size_seed VALUES
(1,221,'36','3.5','4','5','220'),
(2,225,'36 2/3','4','4.5','5.5','225'),
(3,229,'37 1/3','4.5','5','6','230'),
(4,233,'38','5','5.5','6.5','235'),
(5,238,'38 2/3','5.5','6','7','240'),
(6,242,'39 1/3','6','6.5','7.5','245'),
(7,246,'40','6.5','7','8','250'),
(8,250,'40 2/3','7','7.5','8.5','255'),
(9,255,'41 1/3','7.5','8','9','260'),
(10,259,'42','8','8.5','9.5','265'),
(11,263,'42 2/3','8.5','9','10','270'),
(12,267,'43 1/3','9','9.5','10.5','275'),
(13,271,'44','9.5','10','11','280'),
(14,276,'44 2/3','10','10.5','11.5','285'),
(15,280,'45 1/3','10.5','11','12','290'),
(16,284,'46','11','11.5','12.5','295'),
(17,288,'46 2/3','11.5','12','13','300'),
(18,293,'47 1/3','12','12.5','13.5','305'),
(19,297,'48','12.5','13','14','310'),
(20,301,'48 2/3','13','13.5','14.5','315'),
(21,305,'49 1/3','13.5','14','15','320'),
(22,310,'50','14','14.5','15.5','325'),
(23,314,'50 2/3','14.5','15',NULL,NULL),
(24,318,'51 1/3','15','16',NULL,NULL),
(25,326,'52 2/3','16','17',NULL,NULL),
(26,335,'53 1/3','17','18',NULL,NULL),
(27,343,'54 2/3','18','19',NULL,NULL),
(28,352,'55 2/3','19','20',NULL,NULL);

INSERT INTO public.sport_size_guide_entries(guide_id,position,measurement_mm)
SELECT g.id,s.position,s.heel_to_toe_mm
FROM _sport_306_size_seed s
CROSS JOIN public.sport_size_guides g
WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
ON CONFLICT (guide_id,position) DO UPDATE SET
  measurement_mm=EXCLUDED.measurement_mm,
  updated_at=now();

INSERT INTO public.sport_size_guide_labels(entry_id,size_system,audience_scope,size_label)
SELECT e.id,'EU','unisex',s.eu
FROM _sport_306_size_seed s
JOIN public.sport_size_guides g ON g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
JOIN public.sport_size_guide_entries e ON e.guide_id=g.id AND e.position=s.position
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET size_label=EXCLUDED.size_label;

INSERT INTO public.sport_size_guide_labels(entry_id,size_system,audience_scope,size_label)
SELECT e.id,'UK','unisex',s.uk
FROM _sport_306_size_seed s
JOIN public.sport_size_guides g ON g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
JOIN public.sport_size_guide_entries e ON e.guide_id=g.id AND e.position=s.position
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET size_label=EXCLUDED.size_label;

INSERT INTO public.sport_size_guide_labels(entry_id,size_system,audience_scope,size_label)
SELECT e.id,'US','men',s.us_men
FROM _sport_306_size_seed s
JOIN public.sport_size_guides g ON g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
JOIN public.sport_size_guide_entries e ON e.guide_id=g.id AND e.position=s.position
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET size_label=EXCLUDED.size_label;

INSERT INTO public.sport_size_guide_labels(entry_id,size_system,audience_scope,size_label)
SELECT e.id,'US','women',s.us_women
FROM _sport_306_size_seed s
JOIN public.sport_size_guides g ON g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
JOIN public.sport_size_guide_entries e ON e.guide_id=g.id AND e.position=s.position
WHERE s.us_women IS NOT NULL
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET size_label=EXCLUDED.size_label;

INSERT INTO public.sport_size_guide_labels(entry_id,size_system,audience_scope,size_label)
SELECT e.id,'JP','unisex',s.jp
FROM _sport_306_size_seed s
JOIN public.sport_size_guides g ON g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
JOIN public.sport_size_guide_entries e ON e.guide_id=g.id AND e.position=s.position
WHERE s.jp IS NOT NULL
ON CONFLICT (entry_id,size_system,audience_scope) DO UPDATE SET size_label=EXCLUDED.size_label;

ALTER TABLE public.sport_size_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_size_guide_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_size_guide_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_size_guide_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY sport_size_guides_platform_all
  ON public.sport_size_guides FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY sport_size_guide_translations_platform_all
  ON public.sport_size_guide_translations FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY sport_size_guide_entries_platform_all
  ON public.sport_size_guide_entries FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY sport_size_guide_labels_platform_all
  ON public.sport_size_guide_labels FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON
  public.sport_size_guides,
  public.sport_size_guide_translations,
  public.sport_size_guide_entries,
  public.sport_size_guide_labels
FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  public.sport_size_guides,
  public.sport_size_guide_translations,
  public.sport_size_guide_entries,
  public.sport_size_guide_labels
TO bls_platform_runtime;

DO $$
DECLARE
  v_entries integer;
  v_eu integer;
  v_uk integer;
  v_us_men integer;
  v_us_women integer;
BEGIN
  SELECT count(*) INTO v_entries
  FROM public.sport_size_guide_entries e
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1';

  SELECT count(*) INTO v_eu
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
    AND l.size_system='EU';

  SELECT count(*) INTO v_uk
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
    AND l.size_system='UK';

  SELECT count(*) INTO v_us_men
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
    AND l.size_system='US'
    AND l.audience_scope='men';

  SELECT count(*) INTO v_us_women
  FROM public.sport_size_guide_labels l
  JOIN public.sport_size_guide_entries e ON e.id=l.entry_id
  JOIN public.sport_size_guides g ON g.id=e.guide_id
  WHERE g.guide_key='adidas_footwear_unisex_heel_to_toe_v1'
    AND l.size_system='US'
    AND l.audience_scope='women';

  IF v_entries<>28 OR v_eu<>28 OR v_uk<>28 OR v_us_men<>28 OR v_us_women<>22 THEN
    RAISE EXCEPTION 'Unexpected adidas size-guide cardinality: entries %, EU %, UK %, US men %, US women %',
      v_entries,v_eu,v_uk,v_us_men,v_us_women;
  END IF;
END
$$;

COMMIT;

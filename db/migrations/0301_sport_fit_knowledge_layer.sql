-- KONTA MOY — governed Sport & Fit product knowledge layer.
-- Extends the normalized catalogue attribute model with sports-specific facts,
-- evidence/provenance, completeness governance and an enrichment queue.
-- Product facts remain family/variant data; source evidence is never overwritten.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Sports attributes
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _sport_attribute_seed (
  code text PRIMARY KEY,
  data_type text NOT NULL,
  unit text,
  value_mode text NOT NULL,
  group_code text NOT NULL,
  label_el text NOT NULL,
  label_en text NOT NULL,
  help_el text,
  help_en text
) ON COMMIT DROP;

INSERT INTO _sport_attribute_seed VALUES
('sport_activity','multienum',NULL,'controlled','sport','Άθλημα / δραστηριότητα','Sport / activity','Δραστηριότητες για τις οποίες το προϊόν δηλώνεται ή τεκμηριώνεται ως κατάλληλο.','Activities for which the product is explicitly stated or evidenced as suitable.'),
('sport_surface','multienum',NULL,'controlled','sport','Επιφάνεια χρήσης','Sport surface','Επιφάνειες χρήσης που τεκμηριώνονται από κατασκευαστή, κατάλογο ή ισχυρή πηγή.','Use surfaces evidenced by a manufacturer, catalogue or strong source.'),
('sport_use_case','multienum',NULL,'controlled','sport','Χρήση / προπόνηση','Sport use case','Συγκεκριμένος τύπος χρήσης ή προπόνησης.','Specific use or training context.'),
('cushioning_level','enum',NULL,'controlled','sport_footwear','Επίπεδο απορρόφησης','Cushioning level','Κανονικοποιημένη κλίμακα cushioning μόνο όταν υπάρχει τεκμηρίωση.','Normalized cushioning scale only when evidence exists.'),
('support_level','enum',NULL,'controlled','sport_footwear','Επίπεδο στήριξης','Support level','Κανονικοποιημένη κατηγορία στήριξης. Δεν αποτελεί ιατρική σύσταση.','Normalized support category. This is not medical advice.'),
('heel_to_toe_drop_mm','number','mm','free','sport_footwear','Heel-to-toe drop','Heel-to-toe drop','Διαφορά ύψους φτέρνας–μπροστινού μέρους σε mm από τεκμηριωμένη πηγή.','Heel-to-forefoot offset in mm from an evidenced source.'),
('heel_stack_height_mm','number','mm','free','sport_footwear','Ύψος σόλας φτέρνας','Heel stack height','Ύψος stack στη φτέρνα σε mm, μαζί με το πλαίσιο μέτρησης της πηγής.','Heel stack height in mm, retaining the source measurement context.'),
('forefoot_stack_height_mm','number','mm','free','sport_footwear','Ύψος σόλας μπροστινού μέρους','Forefoot stack height','Ύψος stack στο μπροστινό μέρος σε mm.','Forefoot stack height in mm.'),
('shoe_weight_g','number','g','free','sport_footwear','Βάρος παπουτσιού','Shoe weight','Βάρος αναφοράς σε γραμμάρια. Το μέγεθος αναφοράς πρέπει να παραμένει στην τεκμηρίωση.','Reference shoe weight in grams. Reference size must remain in the evidence.'),
('footwear_width_profile','enum',NULL,'controlled','sport_fit','Προφίλ πλάτους','Footwear width profile','Προφίλ εφαρμογής πλάτους του μοντέλου, όχι το αριθμητικό μέγεθος.','Model width-fit profile, not numeric shoe size.'),
('toe_box_profile','enum',NULL,'controlled','sport_fit','Χώρος δακτύλων','Toe-box profile','Κανονικοποιημένο προφίλ toe box μόνο από τεκμηριωμένη πηγή.','Normalized toe-box profile only from evidenced data.'),
('fit_length_profile','enum',NULL,'controlled','sport_fit','Εφαρμογή μήκους','Length fit profile','Αν το μοντέλο τείνει μικρό, κανονικό ή μεγάλο σε μήκος.','Whether the model tends to fit short, true-to-size or long.'),
('football_surface_code','enum',NULL,'controlled','sport_football','Κωδικός σόλας ποδοσφαίρου','Football outsole code','Κωδικός επιφάνειας όπως FG, AG, MG, TF ή IN όταν δηλώνεται από τον κατασκευαστή.','Manufacturer-stated football surface code such as FG, AG, MG, TF or IN.'),
('plate_type','enum',NULL,'controlled','sport_footwear','Πλάκα ενδιάμεσης σόλας','Plate type','Τύπος πλάκας, εφόσον τεκμηριώνεται.','Plate type when evidenced.'),
('weather_protection','multienum',NULL,'controlled','sport_weather','Προστασία καιρού','Weather protection','Δηλωμένη προστασία από νερό ή άνεμο.','Declared water or wind protection.'),
('sock_height','enum',NULL,'controlled','sport_socks','Ύψος κάλτσας','Sock height','Κανονικοποιημένο ύψος αθλητικής κάλτσας.','Normalized sports-sock height.'),
('sock_cushioning','enum',NULL,'controlled','sport_socks','Ενίσχυση κάλτσας','Sock cushioning','Επίπεδο ενίσχυσης / cushioning κάλτσας.','Sock cushioning level.'),
('compression_level','enum',NULL,'controlled','sport_apparel','Επίπεδο συμπίεσης','Compression level','Δηλωμένο επίπεδο συμπίεσης ρούχου ή κάλτσας.','Declared apparel or sock compression level.'),
('moisture_wicking','boolean',NULL,'free','sport_apparel','Απομάκρυνση υγρασίας','Moisture wicking','Αληθές μόνο όταν η ιδιότητα δηλώνεται από τεκμηριωμένη πηγή.','True only when the property is explicitly evidenced.'),
('breathability_level','enum',NULL,'controlled','sport_apparel','Διαπνοή','Breathability level','Κανονικοποιημένη διαπνοή μόνο από τεκμηριωμένα claims ή μετρήσεις.','Normalized breathability only from evidenced claims or measurements.'),
('thermal_level','enum',NULL,'controlled','sport_apparel','Θερμικό επίπεδο','Thermal level','Κανονικοποιημένο επίπεδο θερμικής προστασίας.','Normalized thermal protection level.'),
('reflective_details','boolean',NULL,'free','sport_apparel','Ανακλαστικές λεπτομέρειες','Reflective details','Αν το προϊόν δηλώνει ανακλαστικές λεπτομέρειες.','Whether reflective details are explicitly declared.');

INSERT INTO public.attribute_definitions(code,data_type,unit,value_mode,group_code,variant_identity,filterable,values,active)
SELECT code,data_type,unit,value_mode,group_code,false,true,'[]'::jsonb,true
FROM _sport_attribute_seed
ON CONFLICT (code) DO UPDATE SET
  data_type=EXCLUDED.data_type,
  unit=EXCLUDED.unit,
  value_mode=EXCLUDED.value_mode,
  group_code=EXCLUDED.group_code,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_translations(attribute_id,locale,label,help_text)
SELECT ad.id,'el',s.label_el,s.help_el
FROM _sport_attribute_seed s
JOIN public.attribute_definitions ad ON ad.code=s.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET label=EXCLUDED.label,help_text=EXCLUDED.help_text;

INSERT INTO public.attribute_translations(attribute_id,locale,label,help_text)
SELECT ad.id,'en',s.label_en,s.help_en
FROM _sport_attribute_seed s
JOIN public.attribute_definitions ad ON ad.code=s.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET label=EXCLUDED.label,help_text=EXCLUDED.help_text;

CREATE TEMP TABLE _sport_value_seed (
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  label_el text NOT NULL,
  label_en text NOT NULL,
  sort_order integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _sport_value_seed VALUES
('sport_activity','running','Τρέξιμο','Running',10,'{}'),
('sport_activity','walking','Περπάτημα','Walking',20,'{}'),
('sport_activity','gym_training','Γυμναστήριο / fitness','Gym / fitness training',30,'{}'),
('sport_activity','football','Ποδόσφαιρο','Football',40,'{}'),
('sport_activity','team_sports','Ομαδικά αθλήματα','Team sports',50,'{}'),
('sport_activity','general_training','Γενική αθλητική προπόνηση','General training',60,'{}'),

('sport_surface','road','Άσφαλτος / δρόμος','Road',10,'{}'),
('sport_surface','treadmill','Διάδρομος','Treadmill',20,'{}'),
('sport_surface','track','Στίβος','Track',30,'{}'),
('sport_surface','trail','Χώμα / trail','Trail',40,'{}'),
('sport_surface','mixed','Μικτή επιφάνεια','Mixed surface',50,'{}'),
('sport_surface','indoor','Indoor','Indoor',60,'{}'),
('sport_surface','natural_grass_firm','Φυσικό χορτάρι / firm ground','Natural grass / firm ground',70,'{"footballCode":"FG"}'),
('sport_surface','natural_grass_soft','Μαλακό φυσικό χορτάρι','Soft natural grass',80,'{}'),
('sport_surface','artificial_grass','Συνθετικό γρασίδι','Artificial grass',90,'{"footballCode":"AG"}'),
('sport_surface','turf','Turf','Turf',100,'{"footballCode":"TF"}'),
('sport_surface','multi_ground','Φυσικό & συνθετικό / multi-ground','Natural & artificial / multi-ground',110,'{"footballCode":"MG"}'),

('sport_use_case','daily_training','Καθημερινή προπόνηση','Daily training',10,'{}'),
('sport_use_case','easy_run','Χαλαρό τρέξιμο','Easy run',20,'{}'),
('sport_use_case','recovery_run','Recovery run','Recovery run',30,'{}'),
('sport_use_case','long_run','Μεγάλη απόσταση','Long run',40,'{}'),
('sport_use_case','speed_training','Γρήγορη προπόνηση','Speed training',50,'{}'),
('sport_use_case','race_day','Αγώνας','Race day',60,'{}'),
('sport_use_case','daily_walking','Καθημερινό περπάτημα','Daily walking',70,'{}'),
('sport_use_case','gym_strength','Ενδυνάμωση','Strength training',80,'{}'),
('sport_use_case','gym_cardio','Cardio','Cardio training',90,'{}'),
('sport_use_case','football_training','Προπόνηση ποδοσφαίρου','Football training',100,'{}'),
('sport_use_case','football_match','Αγώνας ποδοσφαίρου','Football match',110,'{}'),

('cushioning_level','minimal','Minimal','Minimal',10,'{}'),
('cushioning_level','low','Χαμηλό','Low',20,'{}'),
('cushioning_level','medium','Μεσαίο','Medium',30,'{}'),
('cushioning_level','high','Υψηλό','High',40,'{}'),
('cushioning_level','max','Μέγιστο','Max',50,'{}'),

('support_level','neutral','Neutral','Neutral',10,'{}'),
('support_level','guided','Ήπια καθοδήγηση','Guided support',20,'{}'),
('support_level','stability','Stability','Stability',30,'{}'),
('support_level','max_support','Μέγιστη στήριξη','Max support',40,'{}'),

('footwear_width_profile','narrow','Στενό','Narrow',10,'{}'),
('footwear_width_profile','standard','Κανονικό','Standard',20,'{}'),
('footwear_width_profile','wide','Φαρδύ','Wide',30,'{}'),
('footwear_width_profile','extra_wide','Πολύ φαρδύ','Extra wide',40,'{}'),

('toe_box_profile','tapered','Στενεύει μπροστά','Tapered',10,'{}'),
('toe_box_profile','standard','Κανονικό','Standard',20,'{}'),
('toe_box_profile','roomy','Ευρύχωρο','Roomy',30,'{}'),

('fit_length_profile','short','Τείνει μικρό','Runs short',10,'{}'),
('fit_length_profile','true_to_size','Κανονικό μέγεθος','True to size',20,'{}'),
('fit_length_profile','long','Τείνει μεγάλο','Runs long',30,'{}'),

('football_surface_code','fg','FG · Firm Ground','FG · Firm Ground',10,'{"surface":"natural_grass_firm"}'),
('football_surface_code','ag','AG · Artificial Grass','AG · Artificial Grass',20,'{"surface":"artificial_grass"}'),
('football_surface_code','mg','MG · Multi Ground','MG · Multi Ground',30,'{"surface":"multi_ground"}'),
('football_surface_code','tf','TF · Turf','TF · Turf',40,'{"surface":"turf"}'),
('football_surface_code','in','IN · Indoor','IN · Indoor',50,'{"surface":"indoor"}'),

('plate_type','none','Χωρίς πλάκα','No plate',10,'{}'),
('plate_type','nylon','Nylon','Nylon',20,'{}'),
('plate_type','carbon','Carbon','Carbon',30,'{}'),
('plate_type','composite','Composite','Composite',40,'{}'),

('weather_protection','water_resistant','Ανθεκτικό στο νερό','Water resistant',10,'{}'),
('weather_protection','waterproof','Αδιάβροχο','Waterproof',20,'{}'),
('weather_protection','wind_resistant','Αντιανεμικό','Wind resistant',30,'{}'),

('sock_height','no_show','No-show','No-show',10,'{}'),
('sock_height','ankle','Αστράγαλος','Ankle',20,'{}'),
('sock_height','quarter','Quarter','Quarter',30,'{}'),
('sock_height','crew','Crew','Crew',40,'{}'),
('sock_height','knee_high','Μέχρι το γόνατο','Knee high',50,'{}'),

('sock_cushioning','none','Χωρίς ενίσχυση','None',10,'{}'),
('sock_cushioning','light','Ελαφριά','Light',20,'{}'),
('sock_cushioning','medium','Μεσαία','Medium',30,'{}'),
('sock_cushioning','max','Υψηλή','Max',40,'{}'),

('compression_level','none','Χωρίς συμπίεση','None',10,'{}'),
('compression_level','light','Ελαφριά','Light',20,'{}'),
('compression_level','medium','Μεσαία','Medium',30,'{}'),
('compression_level','firm','Ισχυρή','Firm',40,'{}'),

('breathability_level','low','Χαμηλή','Low',10,'{}'),
('breathability_level','medium','Μεσαία','Medium',20,'{}'),
('breathability_level','high','Υψηλή','High',30,'{}'),

('thermal_level','lightweight','Ελαφρύ','Lightweight',10,'{}'),
('thermal_level','midweight','Μεσαίο','Midweight',20,'{}'),
('thermal_level','thermal','Θερμικό','Thermal',30,'{}');

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,s.value_code,s.sort_order,s.metadata
FROM _sport_value_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  active=true,
  updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el',s.label_el
FROM _sport_value_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en',s.label_en
FROM _sport_value_seed s
JOIN public.attribute_definitions ad ON ad.code=s.attribute_code
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

-- ---------------------------------------------------------------------------
-- 2. Product Type contracts
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _sport_rule_seed (
  product_type_code text NOT NULL,
  attribute_code text NOT NULL,
  requirement_level text NOT NULL,
  value_level text NOT NULL,
  filterable boolean NOT NULL,
  searchable boolean NOT NULL,
  customer_visible boolean NOT NULL,
  comparable boolean NOT NULL,
  allow_multiple boolean NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY(product_type_code,attribute_code)
) ON COMMIT DROP;

INSERT INTO _sport_rule_seed VALUES
-- Running shoe: rich technical contract.
('running_shoe','sport_activity','required','family',true,true,true,true,true,100),
('running_shoe','sport_surface','recommended','family',true,true,true,true,true,110),
('running_shoe','sport_use_case','recommended','family',true,true,true,true,true,120),
('running_shoe','cushioning_level','recommended','family',true,false,true,true,false,130),
('running_shoe','support_level','recommended','family',true,false,true,true,false,140),
('running_shoe','heel_to_toe_drop_mm','recommended','family',true,false,true,true,false,150),
('running_shoe','heel_stack_height_mm','optional','family',false,false,true,true,false,160),
('running_shoe','forefoot_stack_height_mm','optional','family',false,false,true,true,false,170),
('running_shoe','shoe_weight_g','recommended','family',true,false,true,true,false,180),
('running_shoe','footwear_width_profile','recommended','family',true,false,true,true,false,190),
('running_shoe','toe_box_profile','optional','family',true,false,true,true,false,200),
('running_shoe','fit_length_profile','recommended','family',true,false,true,true,false,210),
('running_shoe','plate_type','optional','family',true,false,true,true,false,220),
('running_shoe','weather_protection','optional','family',true,false,true,false,true,230),

-- Generic footwear can later become walking, gym or football footwear without changing Product Type.
('footwear','sport_activity','optional','family',true,true,true,true,true,100),
('footwear','sport_surface','optional','family',true,true,true,true,true,110),
('footwear','sport_use_case','optional','family',true,true,true,true,true,120),
('footwear','cushioning_level','optional','family',true,false,true,true,false,130),
('footwear','support_level','optional','family',true,false,true,true,false,140),
('footwear','shoe_weight_g','optional','family',true,false,true,true,false,150),
('footwear','footwear_width_profile','optional','family',true,false,true,true,false,160),
('footwear','toe_box_profile','optional','family',true,false,true,true,false,170),
('footwear','fit_length_profile','optional','family',true,false,true,true,false,180),
('footwear','heel_to_toe_drop_mm','optional','family',true,false,true,true,false,190),
('footwear','heel_stack_height_mm','optional','family',false,false,true,true,false,200),
('footwear','forefoot_stack_height_mm','optional','family',false,false,true,true,false,210),
('footwear','plate_type','optional','family',true,false,true,true,false,220),
('footwear','football_surface_code','optional','family',true,true,true,true,false,230),
('footwear','weather_protection','optional','family',true,false,true,false,true,240),

-- Apparel supports sports use and performance properties without assuming sport from fashion alone.
('apparel','sport_activity','optional','family',true,true,true,true,true,100),
('apparel','sport_surface','optional','family',true,false,true,false,true,110),
('apparel','sport_use_case','optional','family',true,true,true,true,true,120),
('apparel','compression_level','optional','family',true,false,true,true,false,130),
('apparel','moisture_wicking','optional','family',true,false,true,true,false,140),
('apparel','breathability_level','optional','family',true,false,true,true,false,150),
('apparel','thermal_level','optional','family',true,false,true,true,false,160),
('apparel','reflective_details','optional','family',true,false,true,false,false,170),
('apparel','weather_protection','optional','family',true,false,true,false,true,180),
('apparel','sock_height','optional','family',true,false,true,true,false,190),
('apparel','sock_cushioning','optional','family',true,false,true,true,false,200),

-- Sports equipment gets activity/use/surface semantics.
('sports_equipment','sport_activity','recommended','family',true,true,true,true,true,100),
('sports_equipment','sport_surface','optional','family',true,true,true,true,true,110),
('sports_equipment','sport_use_case','optional','family',true,true,true,true,true,120);

INSERT INTO public.product_type_attributes(
  product_type_id,attribute_id,requirement_level,value_level,
  filterable,searchable,customer_visible,comparable,
  variant_defining,allow_multiple,sort_order,variant_axis_order
)
SELECT pt.id,ad.id,r.requirement_level,r.value_level,
       r.filterable,r.searchable,r.customer_visible,r.comparable,
       false,r.allow_multiple,r.sort_order,NULL
FROM _sport_rule_seed r
JOIN public.product_types pt ON pt.code=r.product_type_code
JOIN public.attribute_definitions ad ON ad.code=r.attribute_code
ON CONFLICT (product_type_id,attribute_id) DO UPDATE SET
  requirement_level=EXCLUDED.requirement_level,
  value_level=EXCLUDED.value_level,
  filterable=EXCLUDED.filterable,
  searchable=EXCLUDED.searchable,
  customer_visible=EXCLUDED.customer_visible,
  comparable=EXCLUDED.comparable,
  variant_defining=false,
  allow_multiple=EXCLUDED.allow_multiple,
  sort_order=EXCLUDED.sort_order,
  variant_axis_order=NULL,
  updated_at=now();

-- Ensure later-imported sports families inherit the already-governed category
-- Product Type default before normalized sports attributes are attached.
UPDATE public.product_families pf
SET product_type_id=cpt.product_type_id,
    updated_at=now()
FROM public.category_product_types cpt
JOIN public.categories c ON c.id=cpt.category_id
WHERE cpt.category_id=pf.category_id
  AND cpt.is_default=true
  AND pf.product_type_id IS NULL
  AND c.code IN (
    'mens-running-shoes','womens-running-shoes','kids-running-shoes',
    'mens-sneakers','womens-sneakers','kids-sneakers',
    'socks-hosiery',
    'fashion-mens-activewear','fashion-womens-activewear','sports-clothing',
    'fitness-accessories','team-sports-equipment'
  );

-- ---------------------------------------------------------------------------
-- 3. Knowledge lifecycle / evidence / enrichment queue
-- ---------------------------------------------------------------------------
CREATE TABLE public.sport_knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_type text NOT NULL CHECK (source_type IN (
    'vendor_feed','manufacturer_product','manufacturer_guide','brand_size_guide',
    'independent_lab','catalog_taxonomy','admin_review','derived_rule','reference_guide'
  )),
  publisher text NOT NULL,
  title text NOT NULL,
  url text,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  published_at date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  source_status text NOT NULL DEFAULT 'current' CHECK (source_status IN ('current','superseded','unavailable')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(source_key)) > 0),
  CHECK (length(btrim(publisher)) > 0),
  CHECK (length(btrim(title)) > 0)
);

CREATE TABLE public.sport_product_knowledge (
  family_id uuid PRIMARY KEY REFERENCES public.product_families(id) ON DELETE CASCADE,
  product_role text NOT NULL CHECK (product_role IN ('footwear','sock','apparel','equipment','accessory')),
  knowledge_status text NOT NULL DEFAULT 'pending' CHECK (knowledge_status IN (
    'pending','researching','partial','verified','conflict','insufficient'
  )),
  identity_quality text NOT NULL DEFAULT 'weak' CHECK (identity_quality IN ('weak','medium','strong')),
  completeness_score numeric(6,5) NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 1),
  evidence_score numeric(6,5) NOT NULL DEFAULT 0 CHECK (evidence_score BETWEEN 0 AND 1),
  source_count integer NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  conflict_count integer NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  knowledge_version text NOT NULL DEFAULT 'sport-knowledge-v1',
  last_enriched_at timestamptz,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sport_product_knowledge_status_idx
  ON public.sport_product_knowledge(knowledge_status,product_role,updated_at DESC);

CREATE TABLE public.sport_product_fact_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.product_families(id) ON DELETE CASCADE,
  canonical_variant_id uuid REFERENCES public.canonical_variants(id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES public.attribute_definitions(id),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  source_id uuid NOT NULL REFERENCES public.sport_knowledge_sources(id) ON DELETE RESTRICT,
  evidence_strength text NOT NULL CHECK (evidence_strength IN (
    'direct_source','manufacturer_claim','independent_measurement','catalog_classification','derived'
  )),
  extraction_method text NOT NULL CHECK (extraction_method IN (
    'feed_field','structured_data','page_text','manual_review','taxonomy_mapping','deterministic_rule','independent_test'
  )),
  evidence_value jsonb NOT NULL CHECK (jsonb_typeof(evidence_value) IN ('string','number','boolean','array','object')),
  evidence_excerpt text,
  source_locator text,
  confidence numeric(6,5) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  identity_confidence numeric(6,5) NOT NULL DEFAULT 1 CHECK (identity_confidence BETWEEN 0 AND 1),
  observed_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES public.sport_product_fact_evidence(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (superseded_by IS NULL OR superseded_by <> id)
);

CREATE INDEX sport_product_fact_evidence_family_idx
  ON public.sport_product_fact_evidence(family_id,attribute_id,active);
CREATE INDEX sport_product_fact_evidence_source_idx
  ON public.sport_product_fact_evidence(source_id,family_id);
CREATE INDEX sport_product_fact_evidence_variant_idx
  ON public.sport_product_fact_evidence(canonical_variant_id)
  WHERE canonical_variant_id IS NOT NULL;

CREATE TABLE public.sport_knowledge_requirements (
  product_role text NOT NULL CHECK (product_role IN ('footwear','sock','apparel','equipment','accessory')),
  attribute_id uuid NOT NULL REFERENCES public.attribute_definitions(id) ON DELETE CASCADE,
  requirement_level text NOT NULL CHECK (requirement_level IN ('required','recommended','optional')),
  weight numeric(8,4) NOT NULL DEFAULT 1 CHECK (weight > 0),
  minimum_confidence numeric(6,5) NOT NULL DEFAULT 0.7 CHECK (minimum_confidence BETWEEN 0 AND 1),
  PRIMARY KEY(product_role,attribute_id)
);

CREATE TABLE public.sport_knowledge_enrichment_queue (
  family_id uuid PRIMARY KEY REFERENCES public.product_families(id) ON DELETE CASCADE,
  product_role text NOT NULL CHECK (product_role IN ('footwear','sock','apparel','equipment','accessory')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','completed','partial','failed','blocked')),
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 1000),
  reason text NOT NULL,
  requested_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_hints jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_hints)='object'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  processing_lease_until timestamptz,
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sport_knowledge_enrichment_queue_pending_idx
  ON public.sport_knowledge_enrichment_queue(status,priority DESC,updated_at)
  WHERE status IN ('pending','partial','failed');

COMMENT ON TABLE public.sport_product_knowledge IS
  'Family-level operational state for Sport & Fit knowledge. Facts themselves remain in normalized catalogue attributes; this table tracks completeness and review state.';
COMMENT ON TABLE public.sport_product_fact_evidence IS
  'Provenance for every sports-specific normalized fact. Evidence may coexist and conflict; it never silently overwrites another source.';
COMMENT ON TABLE public.sport_knowledge_enrichment_queue IS
  'Backfill queue for missing Sport & Fit facts. Workers/research agents must resolve strong product identity before accepting external product facts.';
COMMENT ON COLUMN public.sport_product_fact_evidence.identity_confidence IS
  'Confidence that the evidence refers to the exact canonical family/variant. Low-identity web results must not become verified product facts.';

-- ---------------------------------------------------------------------------
-- 4. Requirements used to calculate knowledge completeness
-- ---------------------------------------------------------------------------
INSERT INTO public.sport_knowledge_requirements(product_role,attribute_id,requirement_level,weight,minimum_confidence)
SELECT x.product_role,ad.id,x.requirement_level,x.weight,x.minimum_confidence
FROM (VALUES
  ('footwear','sport_activity','required',3.0,0.80),
  ('footwear','sport_surface','recommended',2.5,0.80),
  ('footwear','cushioning_level','recommended',2.0,0.75),
  ('footwear','support_level','recommended',2.0,0.75),
  ('footwear','fit_length_profile','recommended',1.5,0.75),
  ('footwear','footwear_width_profile','recommended',1.5,0.75),
  ('footwear','shoe_weight_g','optional',1.0,0.85),
  ('footwear','heel_to_toe_drop_mm','optional',1.0,0.85),
  ('sock','sport_activity','recommended',2.0,0.70),
  ('sock','sock_height','recommended',1.5,0.75),
  ('sock','sock_cushioning','recommended',1.5,0.75),
  ('sock','moisture_wicking','optional',1.0,0.75),
  ('apparel','sport_activity','recommended',2.0,0.70),
  ('apparel','moisture_wicking','recommended',1.5,0.75),
  ('apparel','breathability_level','optional',1.0,0.75),
  ('apparel','thermal_level','optional',1.0,0.75),
  ('equipment','sport_activity','required',3.0,0.80),
  ('equipment','sport_surface','optional',1.5,0.75),
  ('equipment','sport_use_case','recommended',2.0,0.75)
) AS x(product_role,attribute_code,requirement_level,weight,minimum_confidence)
JOIN public.attribute_definitions ad ON ad.code=x.attribute_code
ON CONFLICT (product_role,attribute_id) DO UPDATE SET
  requirement_level=EXCLUDED.requirement_level,
  weight=EXCLUDED.weight,
  minimum_confidence=EXCLUDED.minimum_confidence;

-- ---------------------------------------------------------------------------
-- 5. Source registry
-- General reference guides define vocabulary; they are NOT evidence for a
-- competitor product unless an exact product-level source is separately stored.
-- ---------------------------------------------------------------------------
INSERT INTO public.sport_knowledge_sources(
  source_key,source_type,publisher,title,url,retrieved_at,metadata
) VALUES
(
  'kontamou_catalog_taxonomy',
  'catalog_taxonomy',
  'KONTA MOY',
  'KONTA MOY governed catalogue taxonomy',
  'https://kontamou.site',
  now(),
  '{"scope":"internal taxonomy classification"}'::jsonb
),
(
  'kerasiotis_vendor_xml',
  'vendor_feed',
  'ΚΕΡΑΣΙΩΤΗΣ',
  'Kerasiotis product XML feed',
  'https://www.e-kerasiotis.gr/wp-content/uploads/woo-feed/google/xml/google.xml',
  now(),
  '{"scope":"vendor supplied identity, title, description, price, stock, size, color and identifiers when present"}'::jsonb
),
(
  'brooks_running_gear_glossary',
  'reference_guide',
  'Brooks Running',
  'Running gear glossary / advice',
  'https://www.brooksrunning.com/en_us/advice-tips/',
  now(),
  '{"scope":"terminology reference for heel-to-toe drop, width, cushioning and support; not competitor product evidence"}'::jsonb
),
(
  'adidas_soccer_surface_guide_2025',
  'reference_guide',
  'adidas',
  'How to Buy Soccer Cleats: Fit, Features, Field Surface',
  'https://www.adidas.com/us/blog/594963-how-to-buy-soccer-cleats-fit-features-field-surface',
  now(),
  '{"scope":"football surface-code vocabulary such as FG, AG, MG, turf and indoor; not competitor product evidence"}'::jsonb
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

-- ---------------------------------------------------------------------------
-- 6. Initial canonical-family backfill from governed taxonomy only
-- ---------------------------------------------------------------------------
WITH candidates AS (
  SELECT DISTINCT
         pf.id AS family_id,
         c.code AS category_code,
         pt.code AS product_type_code,
         CASE
           WHEN c.code='socks-hosiery'
             AND EXISTS (
               SELECT 1
               FROM public.canonical_variants cv2
               LEFT JOIN public.product_translations el2 ON el2.canonical_variant_id=cv2.id AND el2.locale='el'
               LEFT JOIN public.product_translations en2 ON en2.canonical_variant_id=cv2.id AND en2.locale='en'
               WHERE cv2.family_id=pf.id
                 AND lower(coalesce(el2.title,en2.title,cv2.model,cv2.slug)) ~ '(sock|καλτσ)'
             ) THEN 'sock'
           WHEN pt.code IN ('running_shoe','footwear') THEN 'footwear'
           WHEN c.code IN ('fashion-mens-activewear','fashion-womens-activewear','sports-clothing') THEN 'apparel'
           WHEN c.code IN ('fitness-accessories','team-sports-equipment') THEN 'equipment'
           ELSE NULL
         END AS product_role
  FROM public.product_families pf
  JOIN public.categories c ON c.id=pf.category_id
  JOIN public.product_types pt ON pt.id=pf.product_type_id
  WHERE pf.active=true
    AND c.code IN (
      'mens-running-shoes','womens-running-shoes','kids-running-shoes',
      'mens-sneakers','womens-sneakers','kids-sneakers',
      'socks-hosiery',
      'fashion-mens-activewear','fashion-womens-activewear','sports-clothing',
      'fitness-accessories','team-sports-equipment'
    )
)
INSERT INTO public.sport_product_knowledge(family_id,product_role,identity_quality,knowledge_status)
SELECT family_id,product_role,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM public.canonical_variants cv
           WHERE cv.family_id=candidates.family_id
             AND (NULLIF(btrim(cv.mpn),'') IS NOT NULL OR NULLIF(btrim(cv.gtin),'') IS NOT NULL)
         ) THEN 'strong'
         ELSE 'medium'
       END,
       'pending'
FROM candidates
WHERE product_role IS NOT NULL
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
  identity_quality=CASE
    WHEN public.sport_product_knowledge.identity_quality='strong' OR EXCLUDED.identity_quality='strong' THEN 'strong'
    WHEN public.sport_product_knowledge.identity_quality='medium' OR EXCLUDED.identity_quality='medium' THEN 'medium'
    ELSE 'weak'
  END,
  updated_at=now();

-- Seed only facts justified directly by category semantics.
WITH taxonomy_source AS (
  SELECT id FROM public.sport_knowledge_sources WHERE source_key='kontamou_catalog_taxonomy'
), activity_values AS (
  SELECT ad.id attribute_id,av.id attribute_value_id,av.code
  FROM public.attribute_definitions ad
  JOIN public.attribute_values av ON av.attribute_id=ad.id
  WHERE ad.code='sport_activity'
    AND av.code IN ('running','general_training','gym_training','team_sports')
), seed AS (
  SELECT DISTINCT pf.id family_id,
         CASE
           WHEN c.code IN ('mens-running-shoes','womens-running-shoes','kids-running-shoes') THEN 'running'
           WHEN c.code IN ('fashion-mens-activewear','fashion-womens-activewear','sports-clothing') THEN 'general_training'
           WHEN c.code='fitness-accessories' THEN 'gym_training'
           WHEN c.code='team-sports-equipment' THEN 'team_sports'
         END activity_code,
         CASE
           WHEN c.code IN ('mens-running-shoes','womens-running-shoes','kids-running-shoes') THEN 1.00000
           WHEN c.code='fitness-accessories' THEN 0.90000
           WHEN c.code='team-sports-equipment' THEN 0.90000
           ELSE 0.75000
         END confidence,
         c.code category_code
  FROM public.product_families pf
  JOIN public.categories c ON c.id=pf.category_id
  WHERE pf.active=true
    AND c.code IN (
      'mens-running-shoes','womens-running-shoes','kids-running-shoes',
      'fashion-mens-activewear','fashion-womens-activewear','sports-clothing',
      'fitness-accessories','team-sports-equipment'
    )
)
INSERT INTO public.product_family_attribute_values(
  family_id,attribute_id,position,attribute_value_id,source,confidence
)
SELECT s.family_id,av.attribute_id,0,av.attribute_value_id,'migration',s.confidence
FROM seed s
JOIN activity_values av ON av.code=s.activity_code
WHERE s.activity_code IS NOT NULL
ON CONFLICT (family_id,attribute_id,position) DO NOTHING;

WITH taxonomy_source AS (
  SELECT id FROM public.sport_knowledge_sources WHERE source_key='kontamou_catalog_taxonomy'
), sport_values AS (
  SELECT pfav.family_id,pfav.attribute_id,pfav.position,pfav.attribute_value_id,pfav.confidence,
         av.code activity_code,c.code category_code
  FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code='sport_activity'
  JOIN public.attribute_values av ON av.id=pfav.attribute_value_id
  JOIN public.product_families pf ON pf.id=pfav.family_id
  JOIN public.categories c ON c.id=pf.category_id
  WHERE pfav.source='migration'
    AND c.code IN (
      'mens-running-shoes','womens-running-shoes','kids-running-shoes',
      'fashion-mens-activewear','fashion-womens-activewear','sports-clothing',
      'fitness-accessories','team-sports-equipment'
    )
)
INSERT INTO public.sport_product_fact_evidence(
  family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
  evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence
)
SELECT sv.family_id,sv.attribute_id,sv.position,ts.id,
       'catalog_classification','taxonomy_mapping',
       to_jsonb(sv.activity_code),
       'KONTA MOY category ' || sv.category_code || ' supports this broad activity classification.',
       'categories.code=' || sv.category_code,
       coalesce(sv.confidence,0.75),1.00000
FROM sport_values sv
CROSS JOIN taxonomy_source ts;

-- Queue every sport family. Research should prefer manufacturer pages by exact
-- MPN/GTIN/model identity; weak identity must remain pending/insufficient.
INSERT INTO public.sport_knowledge_enrichment_queue(
  family_id,product_role,status,priority,reason,requested_fields,source_hints
)
SELECT k.family_id,k.product_role,'pending',
       CASE k.product_role WHEN 'footwear' THEN 100 WHEN 'sock' THEN 80 WHEN 'equipment' THEN 75 ELSE 70 END,
       'Initial Sport & Fit knowledge backfill',
       CASE k.product_role
         WHEN 'footwear' THEN ARRAY[
           'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
           'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
           'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
           'plate_type','weather_protection'
         ]::text[]
         WHEN 'sock' THEN ARRAY['sport_activity','sock_height','sock_cushioning','compression_level','moisture_wicking']::text[]
         WHEN 'apparel' THEN ARRAY['sport_activity','sport_use_case','moisture_wicking','breathability_level','thermal_level','reflective_details','weather_protection']::text[]
         ELSE ARRAY['sport_activity','sport_surface','sport_use_case']::text[]
       END,
       jsonb_build_object(
         'identityPreference', ARRAY['gtin','mpn','brand_model','exact_title'],
         'acceptProductFactsOnlyWhenIdentityStrong', true
       )
FROM public.sport_product_knowledge k
ON CONFLICT (family_id) DO UPDATE SET
  product_role=EXCLUDED.product_role,
  priority=GREATEST(public.sport_knowledge_enrichment_queue.priority,EXCLUDED.priority),
  requested_fields=EXCLUDED.requested_fields,
  source_hints=EXCLUDED.source_hints,
  updated_at=now();

-- ---------------------------------------------------------------------------
-- 7. Completeness refresh helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bls_private.refresh_sport_product_knowledge(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_role text;
  v_total_weight numeric := 0;
  v_met_weight numeric := 0;
  v_evidence_weight numeric := 0;
  v_source_count integer := 0;
  v_conflict_count integer := 0;
BEGIN
  SELECT product_role INTO v_role
  FROM public.sport_product_knowledge
  WHERE family_id=p_family_id;

  IF v_role IS NULL THEN
    RETURN;
  END IF;

  SELECT
    coalesce(sum(r.weight),0),
    coalesce(sum(r.weight) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.product_family_attribute_values fv
        WHERE fv.family_id=p_family_id
          AND fv.attribute_id=r.attribute_id
          AND coalesce(fv.confidence,0) >= r.minimum_confidence
      )
    ),0),
    coalesce(sum(r.weight) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.sport_product_fact_evidence e
        WHERE e.family_id=p_family_id
          AND e.attribute_id=r.attribute_id
          AND e.active
          AND e.confidence >= r.minimum_confidence
          AND e.identity_confidence >= r.minimum_confidence
      )
    ),0)
  INTO v_total_weight,v_met_weight,v_evidence_weight
  FROM public.sport_knowledge_requirements r
  WHERE r.product_role=v_role;

  SELECT count(DISTINCT source_id)::int
  INTO v_source_count
  FROM public.sport_product_fact_evidence
  WHERE family_id=p_family_id AND active;

  SELECT count(*)::int
  INTO v_conflict_count
  FROM (
    SELECT attribute_id,position
    FROM public.sport_product_fact_evidence
    WHERE family_id=p_family_id AND active AND confidence>=0.75 AND identity_confidence>=0.75
    GROUP BY attribute_id,position
    HAVING count(DISTINCT evidence_value)>1
  ) conflicts;

  UPDATE public.sport_product_knowledge
  SET completeness_score=CASE WHEN v_total_weight>0 THEN LEAST(1,v_met_weight/v_total_weight) ELSE 0 END,
      evidence_score=CASE WHEN v_total_weight>0 THEN LEAST(1,v_evidence_weight/v_total_weight) ELSE 0 END,
      source_count=v_source_count,
      conflict_count=v_conflict_count,
      knowledge_status=CASE
        WHEN v_conflict_count>0 THEN 'conflict'
        WHEN v_total_weight>0 AND v_met_weight/v_total_weight>=0.85 AND v_evidence_weight/v_total_weight>=0.75 THEN 'verified'
        WHEN v_met_weight>0 THEN 'partial'
        ELSE 'pending'
      END,
      updated_at=now()
  WHERE family_id=p_family_id;
END;
$$;

REVOKE ALL ON FUNCTION bls_private.refresh_sport_product_knowledge(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION bls_private.refresh_sport_product_knowledge(uuid) TO bls_platform_runtime;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM public.sport_product_knowledge LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 8. RLS / privileges
-- ---------------------------------------------------------------------------
ALTER TABLE public.sport_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_product_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_product_fact_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_knowledge_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sport_knowledge_enrichment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY sport_knowledge_sources_platform_all
  ON public.sport_knowledge_sources FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY sport_product_knowledge_platform_all
  ON public.sport_product_knowledge FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY sport_product_fact_evidence_platform_all
  ON public.sport_product_fact_evidence FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY sport_knowledge_requirements_platform_all
  ON public.sport_knowledge_requirements FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY sport_knowledge_enrichment_queue_platform_all
  ON public.sport_knowledge_enrichment_queue FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

-- Public storefront code should consume normalized approved facts through server
-- runtime loaders, not browse raw research evidence directly.
REVOKE ALL ON
  public.sport_knowledge_sources,
  public.sport_product_knowledge,
  public.sport_product_fact_evidence,
  public.sport_knowledge_requirements,
  public.sport_knowledge_enrichment_queue
FROM PUBLIC,anon,authenticated,service_role;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  public.sport_knowledge_sources,
  public.sport_product_knowledge,
  public.sport_product_fact_evidence,
  public.sport_knowledge_requirements,
  public.sport_knowledge_enrichment_queue
TO bls_platform_runtime;

-- ---------------------------------------------------------------------------
-- 9. Migration invariants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_attribute_count integer;
  v_source_count integer;
  v_running_contract_count integer;
BEGIN
  SELECT count(*) INTO v_attribute_count
  FROM public.attribute_definitions
  WHERE code IN (
    'sport_activity','sport_surface','sport_use_case','cushioning_level','support_level',
    'heel_to_toe_drop_mm','heel_stack_height_mm','forefoot_stack_height_mm','shoe_weight_g',
    'footwear_width_profile','toe_box_profile','fit_length_profile','football_surface_code',
    'plate_type','weather_protection','sock_height','sock_cushioning','compression_level',
    'moisture_wicking','breathability_level','thermal_level','reflective_details'
  );
  IF v_attribute_count <> 22 THEN
    RAISE EXCEPTION 'Expected 22 Sport & Fit attributes, found %',v_attribute_count;
  END IF;

  SELECT count(*) INTO v_source_count
  FROM public.sport_knowledge_sources
  WHERE source_key IN (
    'kontamou_catalog_taxonomy','kerasiotis_vendor_xml',
    'brooks_running_gear_glossary','adidas_soccer_surface_guide_2025'
  ) AND active;
  IF v_source_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 initial Sport & Fit knowledge sources, found %',v_source_count;
  END IF;

  SELECT count(*) INTO v_running_contract_count
  FROM public.product_type_attributes pta
  JOIN public.product_types pt ON pt.id=pta.product_type_id
  JOIN public.attribute_definitions ad ON ad.id=pta.attribute_id
  WHERE pt.code='running_shoe' AND ad.group_code LIKE 'sport%';
  IF v_running_contract_count < 10 THEN
    RAISE EXCEPTION 'Running shoe Sport & Fit contract is incomplete (% attributes)',v_running_contract_count;
  END IF;
END
$$;

COMMIT;

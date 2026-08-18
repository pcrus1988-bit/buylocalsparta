-- Buy Local Sparta — initial production Product Type and normalized attribute schema seed.
-- Covers current live catalogue plus representative high-value retail classes.

BEGIN;

-- ---------------------------------------------------------------------------
-- Attribute definitions and translations
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _attribute_seed (
  code text PRIMARY KEY,
  data_type text NOT NULL,
  unit text,
  value_mode text NOT NULL,
  group_code text,
  label_el text NOT NULL,
  label_en text NOT NULL,
  help_el text,
  help_en text
) ON COMMIT DROP;

INSERT INTO _attribute_seed VALUES
('manufacturer_colour','text',NULL,'free','appearance','Χρώμα κατασκευαστή','Manufacturer colour','Η επίσημη εμπορική ονομασία χρώματος.','Official manufacturer/commercial colour name.'),
('apparel_size','enum',NULL,'controlled','dimensions','Μέγεθος ένδυσης','Apparel size',NULL,NULL),
('footwear_size','text',NULL,'free','dimensions','Μέγεθος υποδήματος','Footwear size','Διατηρείται η ακριβής ονομασία μεγέθους του κατασκευαστή.','Preserves the manufacturer’s exact size notation.'),
('gender','enum',NULL,'controlled','audience','Φύλο / κοινό','Gender / audience',NULL,NULL),
('composition','text',NULL,'free','materials','Σύνθεση','Composition',NULL,NULL),
('fit','enum',NULL,'controlled','appearance','Εφαρμογή','Fit',NULL,NULL),
('pattern','enum',NULL,'controlled','appearance','Μοτίβο','Pattern',NULL,NULL),
('sleeve_length','enum',NULL,'controlled','appearance','Μήκος μανικιού','Sleeve length',NULL,NULL),
('author','text',NULL,'free','publishing','Συγγραφέας','Author',NULL,NULL),
('publisher','text',NULL,'free','publishing','Εκδότης','Publisher',NULL,NULL),
('language','enum',NULL,'controlled','publishing','Γλώσσα','Language',NULL,NULL),
('page_count','number','pages','free','publishing','Αριθμός σελίδων','Page count',NULL,NULL),
('publication_format','enum',NULL,'controlled','publishing','Μορφή έκδοσης','Publication format',NULL,NULL),
('paper_size','enum',NULL,'controlled','paper','Μέγεθος χαρτιού','Paper size',NULL,NULL),
('ruling','enum',NULL,'controlled','paper','Γραμμογράφηση','Ruling',NULL,NULL),
('sheet_count','number','sheets','free','paper','Αριθμός φύλλων','Sheet count',NULL,NULL),
('binding','enum',NULL,'controlled','paper','Βιβλιοδεσία','Binding',NULL,NULL),
('paper_weight','number','g/m²','free','paper','Βάρος χαρτιού','Paper weight',NULL,NULL),
('ink_colour','enum',NULL,'controlled','writing','Χρώμα μελανιού','Ink colour',NULL,NULL),
('pen_type','enum',NULL,'controlled','writing','Τύπος στυλό','Pen type',NULL,NULL),
('tip_size','number','mm','free','writing','Πάχος μύτης','Tip size',NULL,NULL),
('retractable','boolean',NULL,'free','writing','Ανασυρόμενο','Retractable',NULL,NULL),
('pack_quantity','number','items','free','packaging','Ποσότητα συσκευασίας','Pack quantity',NULL,NULL),
('age_group','enum',NULL,'controlled','audience','Ηλικιακή ομάδα','Age group',NULL,NULL),
('players_min','number','players','free','games','Ελάχιστοι παίκτες','Minimum players',NULL,NULL),
('players_max','number','players','free','games','Μέγιστοι παίκτες','Maximum players',NULL,NULL),
('play_time_minutes','number','min','free','games','Χρόνος παιχνιδιού','Play time',NULL,NULL),
('storage_capacity_gb','number','GB','free','technology','Χωρητικότητα αποθήκευσης','Storage capacity',NULL,NULL),
('ram_gb','number','GB','free','technology','Μνήμη RAM','RAM',NULL,NULL),
('screen_size_inches','number','in','free','technology','Μέγεθος οθόνης','Screen size',NULL,NULL),
('processor','text',NULL,'free','technology','Επεξεργαστής','Processor',NULL,NULL),
('operating_system','enum',NULL,'controlled','technology','Λειτουργικό σύστημα','Operating system',NULL,NULL),
('network_generation','enum',NULL,'controlled','technology','Δίκτυο κινητής','Mobile network generation',NULL,NULL),
('fragrance_volume_ml','number','ml','free','beauty','Όγκος αρώματος','Fragrance volume',NULL,NULL),
('fragrance_concentration','enum',NULL,'controlled','beauty','Συγκέντρωση αρώματος','Fragrance concentration',NULL,NULL),
('shade_name','text',NULL,'free','beauty','Ονομασία απόχρωσης','Shade name',NULL,NULL),
('tool_power_source','enum',NULL,'controlled','tools','Τροφοδοσία εργαλείου','Tool power source',NULL,NULL),
('voltage_v','number','V','free','electrical','Τάση','Voltage',NULL,NULL),
('battery_platform','text',NULL,'free','tools','Πλατφόρμα μπαταρίας','Battery platform',NULL,NULL),
('paint_volume_l','number','L','free','paint','Όγκος χρώματος','Paint volume',NULL,NULL),
('paint_finish','enum',NULL,'controlled','paint','Φινίρισμα χρώματος','Paint finish',NULL,NULL),
('mattress_width_cm','number','cm','free','dimensions','Πλάτος στρώματος','Mattress width',NULL,NULL),
('mattress_length_cm','number','cm','free','dimensions','Μήκος στρώματος','Mattress length',NULL,NULL),
('firmness','enum',NULL,'controlled','comfort','Σκληρότητα','Firmness',NULL,NULL),
('product_dimensions','dimension',NULL,'free','dimensions','Διαστάσεις προϊόντος','Product dimensions',NULL,NULL),
('curtain_width_cm','number','cm','free','dimensions','Πλάτος κουρτίνας','Curtain width',NULL,NULL),
('curtain_drop_cm','number','cm','free','dimensions','Ύψος κουρτίνας','Curtain drop',NULL,NULL),
('bicycle_frame_size','text',NULL,'free','dimensions','Μέγεθος σκελετού ποδηλάτου','Bicycle frame size',NULL,NULL),
('wheel_size_inches','number','in','free','dimensions','Μέγεθος τροχού','Wheel size',NULL,NULL),
('gear_count','number','gears','free','bicycle','Αριθμός ταχυτήτων','Gear count',NULL,NULL),
('battery_capacity_ah','number','Ah','free','automotive','Χωρητικότητα μπαταρίας','Battery capacity',NULL,NULL),
('battery_cca','number','A','free','automotive','Ρεύμα ψυχρής εκκίνησης (CCA)','Cold cranking amps (CCA)',NULL,NULL),
('tyre_width_mm','number','mm','free','automotive','Πλάτος ελαστικού','Tyre width',NULL,NULL),
('tyre_aspect_ratio','number','%','free','automotive','Προφίλ ελαστικού','Tyre aspect ratio',NULL,NULL),
('tyre_rim_inches','number','in','free','automotive','Διάμετρος ζάντας','Tyre rim diameter',NULL,NULL),
('tyre_load_index','text',NULL,'free','automotive','Δείκτης φορτίου','Load index',NULL,NULL),
('tyre_speed_rating','text',NULL,'free','automotive','Δείκτης ταχύτητας','Speed rating',NULL,NULL),
('jewellery_material','enum',NULL,'controlled','jewellery','Υλικό κοσμήματος','Jewellery material',NULL,NULL),
('gemstone','text',NULL,'free','jewellery','Πολύτιμος / ημιπολύτιμος λίθος','Gemstone',NULL,NULL),
('ring_size','text',NULL,'free','jewellery','Μέγεθος δαχτυλιδιού','Ring size',NULL,NULL);

INSERT INTO attribute_definitions(code,data_type,unit,value_mode,group_code,variant_identity,filterable,values)
SELECT code,data_type,unit,value_mode,group_code,false,true,'[]'::jsonb
FROM _attribute_seed
ON CONFLICT (code) DO UPDATE SET
  data_type=EXCLUDED.data_type,
  unit=EXCLUDED.unit,
  value_mode=EXCLUDED.value_mode,
  group_code=EXCLUDED.group_code,
  updated_at=now();

INSERT INTO attribute_translations(attribute_id,locale,label,help_text)
SELECT ad.id,'el',s.label_el,s.help_el
FROM _attribute_seed s JOIN attribute_definitions ad ON ad.code=s.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET label=EXCLUDED.label,help_text=EXCLUDED.help_text;
INSERT INTO attribute_translations(attribute_id,locale,label,help_text)
SELECT ad.id,'en',s.label_en,s.help_en
FROM _attribute_seed s JOIN attribute_definitions ad ON ad.code=s.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET label=EXCLUDED.label,help_text=EXCLUDED.help_text;

-- Existing ambiguous generic `size` stays available for legacy payloads but is no longer
-- eligible for new schema assignment. Dedicated paper/apparel/footwear attributes replace it.
UPDATE attribute_definitions SET active=false, updated_at=now() WHERE code='size';

-- Expand normalized Material and Colour vocabularies used as cross-category filters.
UPDATE attribute_definitions SET value_mode='controlled', updated_at=now() WHERE code IN ('colour','material','cover','connector');

CREATE TEMP TABLE _value_seed (
  attribute_code text NOT NULL,
  value_code text NOT NULL,
  label_el text NOT NULL,
  label_en text NOT NULL,
  sort_order integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _value_seed(attribute_code,value_code,label_el,label_en,sort_order,metadata) VALUES
('colour','white','Λευκό','White',10,'{"hex":"#FFFFFF"}'),
('colour','black','Μαύρο','Black',20,'{"hex":"#000000"}'),
('colour','grey','Γκρι','Grey',30,'{"hex":"#808080"}'),
('colour','silver','Ασημί','Silver',40,'{}'),
('colour','beige','Μπεζ','Beige',50,'{}'),
('colour','brown','Καφέ','Brown',60,'{}'),
('colour','red','Κόκκινο','Red',70,'{}'),
('colour','pink','Ροζ','Pink',80,'{}'),
('colour','orange','Πορτοκαλί','Orange',90,'{}'),
('colour','yellow','Κίτρινο','Yellow',100,'{}'),
('colour','green','Πράσινο','Green',110,'{}'),
('colour','blue','Μπλε','Blue',120,'{}'),
('colour','purple','Μωβ','Purple',130,'{}'),
('colour','gold','Χρυσό','Gold',140,'{}'),
('colour','brass','Μπρούτζινο','Brass',150,'{}'),
('colour','multicolour','Πολύχρωμο','Multicolour',160,'{}'),
('material','metal','Μέταλλο','Metal',10,'{}'),
('material','wood','Ξύλο','Wood',20,'{}'),
('material','plastic','Πλαστικό','Plastic',30,'{}'),
('material','paper','Χαρτί','Paper',40,'{}'),
('material','cotton','Βαμβάκι','Cotton',50,'{}'),
('material','polyester','Πολυεστέρας','Polyester',60,'{}'),
('material','leather','Δέρμα','Leather',70,'{}'),
('material','fabric','Ύφασμα','Fabric',80,'{}'),
('material','glass','Γυαλί','Glass',90,'{}'),
('material','ceramic','Κεραμικό','Ceramic',100,'{}'),
('material','stainless-steel','Ανοξείδωτο ατσάλι','Stainless steel',110,'{}'),
('cover','hard','Σκληρό','Hard',10,'{}'),
('cover','soft','Μαλακό','Soft',20,'{}'),
('connector','usb-c','USB-C','USB-C',10,'{}'),
('connector','lightning','Lightning','Lightning',20,'{}'),
('connector','bluetooth','Bluetooth','Bluetooth',30,'{}'),
('connector','other','Άλλο','Other',40,'{}'),
('apparel_size','xs','XS','XS',10,'{}'),
('apparel_size','s','S','S',20,'{}'),
('apparel_size','m','M','M',30,'{}'),
('apparel_size','l','L','L',40,'{}'),
('apparel_size','xl','XL','XL',50,'{}'),
('apparel_size','xxl','XXL','XXL',60,'{}'),
('apparel_size','3xl','3XL','3XL',70,'{}'),
('gender','women','Γυναίκες','Women',10,'{}'),
('gender','men','Άνδρες','Men',20,'{}'),
('gender','unisex','Unisex','Unisex',30,'{}'),
('gender','girls','Κορίτσια','Girls',40,'{}'),
('gender','boys','Αγόρια','Boys',50,'{}'),
('gender','baby','Βρέφη','Baby',60,'{}'),
('fit','slim','Στενή','Slim',10,'{}'),
('fit','regular','Κανονική','Regular',20,'{}'),
('fit','relaxed','Άνετη','Relaxed',30,'{}'),
('fit','oversized','Oversized','Oversized',40,'{}'),
('pattern','solid','Μονόχρωμο','Solid',10,'{}'),
('pattern','striped','Ριγέ','Striped',20,'{}'),
('pattern','checked','Καρό','Checked',30,'{}'),
('pattern','printed','Εμπριμέ / τυπωμένο','Printed',40,'{}'),
('pattern','floral','Φλοράλ','Floral',50,'{}'),
('pattern','other','Άλλο','Other',60,'{}'),
('sleeve_length','sleeveless','Αμάνικο','Sleeveless',10,'{}'),
('sleeve_length','short','Κοντό μανίκι','Short sleeve',20,'{}'),
('sleeve_length','three-quarter','3/4 μανίκι','Three-quarter sleeve',30,'{}'),
('sleeve_length','long','Μακρύ μανίκι','Long sleeve',40,'{}'),
('language','el','Ελληνικά','Greek',10,'{}'),
('language','en','Αγγλικά','English',20,'{}'),
('language','fr','Γαλλικά','French',30,'{}'),
('language','de','Γερμανικά','German',40,'{}'),
('language','it','Ιταλικά','Italian',50,'{}'),
('language','es','Ισπανικά','Spanish',60,'{}'),
('language','other','Άλλη','Other',70,'{}'),
('publication_format','paperback','Μαλακό εξώφυλλο','Paperback',10,'{}'),
('publication_format','hardcover','Σκληρόδετο','Hardcover',20,'{}'),
('publication_format','board-book','Χαρτονένιο βιβλίο','Board book',30,'{}'),
('publication_format','other','Άλλη μορφή','Other',40,'{}'),
('paper_size','a3','A3','A3',10,'{}'),
('paper_size','a4','A4','A4',20,'{}'),
('paper_size','a5','A5','A5',30,'{}'),
('paper_size','a6','A6','A6',40,'{}'),
('paper_size','other','Άλλο','Other',50,'{}'),
('ruling','lined','Ριγέ','Lined',10,'{}'),
('ruling','squared','Καρέ','Squared',20,'{}'),
('ruling','plain','Λευκό','Plain',30,'{}'),
('ruling','dotted','Dotted','Dotted',40,'{}'),
('ruling','music','Πεντάγραμμο','Music',50,'{}'),
('binding','spiral','Σπιράλ','Spiral',10,'{}'),
('binding','stapled','Καρφίτσα','Stapled',20,'{}'),
('binding','glued','Κολλητό','Glued',30,'{}'),
('binding','hardbound','Σκληρόδετο','Hardbound',40,'{}'),
('ink_colour','blue','Μπλε','Blue',10,'{}'),
('ink_colour','black','Μαύρο','Black',20,'{}'),
('ink_colour','red','Κόκκινο','Red',30,'{}'),
('ink_colour','green','Πράσινο','Green',40,'{}'),
('ink_colour','multicolour','Πολύχρωμο','Multicolour',50,'{}'),
('pen_type','ballpoint','Στυλό διαρκείας','Ballpoint',10,'{}'),
('pen_type','gel','Gel','Gel',20,'{}'),
('pen_type','rollerball','Rollerball','Rollerball',30,'{}'),
('pen_type','fountain','Πένα','Fountain pen',40,'{}'),
('pen_type','felt-tip','Μαρκαδοράκι','Felt tip',50,'{}'),
('age_group','0-2','0–2 ετών','0–2 years',10,'{}'),
('age_group','3-5','3–5 ετών','3–5 years',20,'{}'),
('age_group','6-8','6–8 ετών','6–8 years',30,'{}'),
('age_group','9-12','9–12 ετών','9–12 years',40,'{}'),
('age_group','13-plus','13+ ετών','13+ years',50,'{}'),
('age_group','adult','Ενήλικες','Adults',60,'{}'),
('operating_system','ios','iOS','iOS',10,'{}'),
('operating_system','android','Android','Android',20,'{}'),
('operating_system','windows','Windows','Windows',30,'{}'),
('operating_system','macos','macOS','macOS',40,'{}'),
('operating_system','linux','Linux','Linux',50,'{}'),
('operating_system','other','Άλλο','Other',60,'{}'),
('network_generation','4g','4G','4G',10,'{}'),
('network_generation','5g','5G','5G',20,'{}'),
('fragrance_concentration','edt','Eau de Toilette','Eau de Toilette',10,'{}'),
('fragrance_concentration','edp','Eau de Parfum','Eau de Parfum',20,'{}'),
('fragrance_concentration','parfum','Parfum','Parfum',30,'{}'),
('fragrance_concentration','cologne','Eau de Cologne','Eau de Cologne',40,'{}'),
('tool_power_source','corded','Ρεύματος','Corded',10,'{}'),
('tool_power_source','battery','Μπαταρίας','Battery',20,'{}'),
('tool_power_source','manual','Χειροκίνητο','Manual',30,'{}'),
('tool_power_source','pneumatic','Πνευματικό','Pneumatic',40,'{}'),
('paint_finish','matt','Ματ','Matt',10,'{}'),
('paint_finish','satin','Σατινέ','Satin',20,'{}'),
('paint_finish','gloss','Γυαλιστερό','Gloss',30,'{}'),
('paint_finish','eggshell','Eggshell','Eggshell',40,'{}'),
('firmness','soft','Μαλακό','Soft',10,'{}'),
('firmness','medium','Μέτριο','Medium',20,'{}'),
('firmness','firm','Σκληρό','Firm',30,'{}'),
('firmness','extra-firm','Πολύ σκληρό','Extra firm',40,'{}'),
('jewellery_material','gold','Χρυσός','Gold',10,'{}'),
('jewellery_material','silver','Ασήμι','Silver',20,'{}'),
('jewellery_material','stainless-steel','Ανοξείδωτο ατσάλι','Stainless steel',30,'{}'),
('jewellery_material','platinum','Πλατίνα','Platinum',40,'{}'),
('jewellery_material','other','Άλλο','Other',50,'{}');

INSERT INTO attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,s.value_code,s.sort_order,s.metadata
FROM _value_seed s JOIN attribute_definitions ad ON ad.code=s.attribute_code
ON CONFLICT (attribute_id,code) DO UPDATE SET sort_order=EXCLUDED.sort_order,metadata=EXCLUDED.metadata,active=true,updated_at=now();

INSERT INTO attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el',s.label_el FROM _value_seed s
JOIN attribute_definitions ad ON ad.code=s.attribute_code
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;
INSERT INTO attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en',s.label_en FROM _value_seed s
JOIN attribute_definitions ad ON ad.code=s.attribute_code
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

-- Common aliases used by Greek merchant feeds and international catalogues.
INSERT INTO attribute_value_aliases(attribute_id,attribute_value_id,locale,source_namespace,alias,normalized_alias)
SELECT ad.id,av.id,x.locale,'catalog',x.alias,x.normalized_alias
FROM (VALUES
 ('colour','black','el','Μαύρο','μαυρο'),('colour','white','el','Λευκό','λευκο'),('colour','blue','el','Μπλε','μπλε'),
 ('colour','red','el','Κόκκινο','κοκκινο'),('colour','pink','el','Ροζ','ροζ'),('colour','purple','el','Λιλά','λιλα'),
 ('colour','multicolour','el','Πολύχρωμο','πολυχρωμο'),('colour','multicolour','el','Πολύχρωμο / Multicolour','πολυχρωμο multicolour'),
 ('apparel_size','xs',NULL,'XS','xs'),('apparel_size','s',NULL,'S','s'),('apparel_size','m',NULL,'M','m'),
 ('apparel_size','l',NULL,'L','l'),('apparel_size','xl',NULL,'XL','xl'),('apparel_size','xxl',NULL,'XXL','xxl')
) AS x(attribute_code,value_code,locale,alias,normalized_alias)
JOIN attribute_definitions ad ON ad.code=x.attribute_code
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=x.value_code
ON CONFLICT (attribute_id,source_namespace,locale,normalized_alias) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Product Types
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _product_type_seed (
  code text PRIMARY KEY,
  name_el text NOT NULL,
  name_en text NOT NULL,
  product_mode text NOT NULL,
  variant_strategy text NOT NULL
) ON COMMIT DROP;

INSERT INTO _product_type_seed VALUES
('book','Βιβλίο','Book','standard','matrix'),
('notebook','Τετράδιο / σημειωματάριο','Notebook','standard','matrix'),
('pen','Στυλό','Pen','standard','matrix'),
('toy','Παιχνίδι','Toy','standard','matrix'),
('board_game','Επιτραπέζιο / παιχνίδι καρτών','Board / card game','standard','matrix'),
('apparel','Ένδυμα','Apparel','standard','matrix'),
('dress','Φόρεμα','Dress','standard','matrix'),
('shirt','Πουκάμισο','Shirt','standard','matrix'),
('top','Τοπ','Top','standard','matrix'),
('footwear','Υπόδημα','Footwear','standard','matrix'),
('running_shoe','Παπούτσι τρεξίματος','Running shoe','standard','matrix'),
('smartphone','Smartphone','Smartphone','standard','matrix'),
('laptop','Φορητός υπολογιστής','Laptop','standard','matrix'),
('television','Τηλεόραση','Television','standard','matrix'),
('printer_consumable','Αναλώσιμο εκτυπωτή','Printer consumable','standard','none'),
('fragrance','Άρωμα','Fragrance','standard','matrix'),
('makeup','Προϊόν μακιγιάζ','Makeup product','standard','matrix'),
('power_tool','Ηλεκτρικό εργαλείο','Power tool','standard','matrix'),
('tool_accessory','Εξάρτημα / αναλώσιμο εργαλείου','Tool accessory / consumable','standard','none'),
('paint','Χρώμα / βαφή','Paint','configurable','configurable'),
('mattress','Στρώμα','Mattress','standard','matrix'),
('furniture','Έπιπλο','Furniture','standard','matrix'),
('curtain_blind','Κουρτίνα / στόρι','Curtain / blind','made_to_order','configurable'),
('bicycle','Ποδήλατο','Bicycle','standard','matrix'),
('vehicle_battery','Μπαταρία οχήματος','Vehicle battery','standard','none'),
('tyre','Ελαστικό','Tyre','standard','matrix'),
('automotive_part','Ανταλλακτικό οχήματος','Automotive part','standard','none'),
('jewellery','Κόσμημα','Jewellery','standard','matrix'),
('lighting_fixture','Φωτιστικό','Lighting fixture','standard','matrix'),
('homeware','Οικιακό είδος','Homeware','standard','matrix'),
('packaging','Είδος συσκευασίας','Packaging item','standard','matrix'),
('ceremonial_good','Είδος τελετής','Ceremonial good','standard','matrix'),
('medical_device','Ιατρικό / ορθοπεδικό είδος','Medical / orthopaedic item','standard','matrix');

INSERT INTO product_types(code,product_mode,variant_strategy,status)
SELECT code,product_mode,variant_strategy,'active' FROM _product_type_seed
ON CONFLICT (code) DO UPDATE SET product_mode=EXCLUDED.product_mode,variant_strategy=EXCLUDED.variant_strategy,status='active',updated_at=now();
INSERT INTO product_type_translations(product_type_id,locale,name)
SELECT pt.id,'el',s.name_el FROM _product_type_seed s JOIN product_types pt ON pt.code=s.code
ON CONFLICT (product_type_id,locale) DO UPDATE SET name=EXCLUDED.name;
INSERT INTO product_type_translations(product_type_id,locale,name)
SELECT pt.id,'en',s.name_en FROM _product_type_seed s JOIN product_types pt ON pt.code=s.code
ON CONFLICT (product_type_id,locale) DO UPDATE SET name=EXCLUDED.name;

-- ---------------------------------------------------------------------------
-- Category -> Product Type defaults
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _category_type_seed(category_code text PRIMARY KEY, product_type_code text NOT NULL) ON COMMIT DROP;
INSERT INTO _category_type_seed VALUES
('fiction-books','book'),('nonfiction-books','book'),('children-books','book'),('educational-study-books','book'),('reference-books','book'),
('spiral-notebooks','notebook'),('exercise-books','notebook'),('notepads-memo-books','notebook'),('pens','pen'),
('dolls-figures','toy'),('construction-toys','toy'),('toy-vehicles','toy'),('educational-toys','toy'),('baby-toddler-toys','toy'),('outdoor-toys','toy'),('puzzles','toy'),('toys-hobbies-games','toy'),
('board-games','board_game'),('card-games','board_game'),
('fashion-womens-dresses','dress'),('fashion-womens-shirts','shirt'),('fashion-womens-tops','top'),
('fashion-womens-knitwear','apparel'),('fashion-womens-trousers-jeans','apparel'),('fashion-womens-skirts','apparel'),('fashion-womens-jackets-coats','apparel'),('fashion-womens-sets','apparel'),('fashion-womens-activewear','apparel'),('fashion-womens-swimwear','apparel'),
('fashion-mens-tshirts-tops','apparel'),('fashion-mens-shirts','apparel'),('fashion-mens-knitwear','apparel'),('fashion-mens-trousers-jeans','apparel'),('fashion-mens-jackets-coats','apparel'),('fashion-mens-suits-formal','apparel'),('fashion-mens-activewear','apparel'),('fashion-mens-swimwear','apparel'),
('baby-clothing','apparel'),('girls-clothing','apparel'),('boys-clothing','apparel'),
('womens-running-shoes','running_shoe'),('mens-running-shoes','running_shoe'),('kids-running-shoes','running_shoe'),
('womens-sneakers','footwear'),('womens-boots','footwear'),('womens-sandals','footwear'),('womens-formal-shoes','footwear'),
('mens-sneakers','footwear'),('mens-boots','footwear'),('mens-sandals','footwear'),('mens-formal-shoes','footwear'),
('kids-sneakers','footwear'),('kids-boots','footwear'),('kids-sandals','footwear'),('kids-formal-shoes','footwear'),
('smartphones','smartphone'),('laptops','laptop'),('televisions','television'),('printer-consumables','printer_consumable'),
('fragrance','fragrance'),('face-makeup','makeup'),('eye-makeup','makeup'),('lip-makeup','makeup'),('nail-care-colour','makeup'),
('power-tools','power_tool'),('tool-accessories-consumables','tool_accessory'),('paint-decorating','paint'),
('mattresses','mattress'),('living-room-furniture','furniture'),('dining-room-furniture','furniture'),('bedroom-furniture','furniture'),('office-furniture','furniture'),('children-furniture','furniture'),('outdoor-furniture','furniture'),
('curtains-blinds','curtain_blind'),('bicycles','bicycle'),('vehicle-batteries','vehicle_battery'),('tyres-wheels','tyre'),('car-parts','automotive_part'),('motorcycle-parts','automotive_part'),
('rings','jewellery'),('necklaces','jewellery'),('bracelets','jewellery'),('earrings','jewellery'),
('ceiling-lighting','lighting_fixture'),('wall-lighting','lighting_fixture'),('table-floor-lamps','lighting_fixture'),('outdoor-lighting','lighting_fixture'),
('kitchen-dining-homeware','homeware'),('cookware-bakeware','homeware'),('tableware-glassware','homeware'),('storage-organisation','homeware'),('bathroom-accessories','homeware'),
('retail-packaging','packaging'),('shipping-packaging','packaging'),('labels-tags','packaging'),
('wedding-accessories','ceremonial_good'),('baptism-goods','ceremonial_good'),('religious-items','ceremonial_good'),('ceremonial-decor','ceremonial_good'),
('supports-braces','medical_device'),('mobility-aids','medical_device'),('home-health-devices','medical_device'),('hearing-accessories','medical_device'),('medical-consumables','medical_device');

INSERT INTO category_product_types(category_id,product_type_id,is_default,sort_order)
SELECT c.id,pt.id,true,0
FROM _category_type_seed s JOIN categories c ON c.code=s.category_code JOIN product_types pt ON pt.code=s.product_type_code
ON CONFLICT (category_id,product_type_id) DO UPDATE SET is_default=true,sort_order=0;

-- ---------------------------------------------------------------------------
-- Contextual attribute rules
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _rule_seed (
  product_type_code text NOT NULL,
  attribute_code text NOT NULL,
  requirement_level text NOT NULL,
  value_level text NOT NULL,
  filterable boolean NOT NULL,
  searchable boolean NOT NULL,
  customer_visible boolean NOT NULL,
  comparable boolean NOT NULL,
  variant_defining boolean NOT NULL,
  allow_multiple boolean NOT NULL,
  sort_order integer NOT NULL,
  variant_axis_order integer,
  PRIMARY KEY(product_type_code,attribute_code)
) ON COMMIT DROP;

-- Publishing / stationery / toys
INSERT INTO _rule_seed VALUES
('book','author','required','family',true,true,true,false,false,false,10,NULL),
('book','publisher','recommended','family',true,true,true,false,false,false,20,NULL),
('book','page_count','recommended','variant',false,false,true,true,false,false,30,NULL),
('book','language','required','variant',true,true,true,true,true,false,40,1),
('book','publication_format','required','variant',true,false,true,true,true,false,50,2),
('notebook','paper_size','required','variant',true,false,true,true,true,false,10,1),
('notebook','sheet_count','required','variant',true,false,true,true,true,false,20,2),
('notebook','ruling','required','variant',true,false,true,true,true,false,30,3),
('notebook','manufacturer_colour','optional','variant',false,true,true,false,true,false,40,4),
('notebook','colour','optional','variant',true,false,true,false,false,false,50,NULL),
('notebook','binding','recommended','family',true,false,true,true,false,false,60,NULL),
('notebook','paper_weight','optional','family',true,false,true,true,false,false,70,NULL),
('pen','pen_type','required','family',true,true,true,true,false,false,10,NULL),
('pen','ink_colour','required','variant',true,false,true,true,true,false,20,1),
('pen','tip_size','recommended','variant',true,false,true,true,true,false,30,2),
('pen','retractable','optional','family',true,false,true,true,false,false,40,NULL),
('pen','pack_quantity','recommended','variant',true,false,true,true,true,false,50,3),
('toy','age_group','recommended','family',true,false,true,true,false,false,10,NULL),
('toy','material','optional','family',true,false,true,true,false,true,20,NULL),
('toy','manufacturer_colour','optional','variant',false,true,true,false,true,false,30,1),
('toy','colour','optional','variant',true,false,true,false,false,false,40,NULL),
('board_game','age_group','recommended','family',true,false,true,true,false,false,10,NULL),
('board_game','players_min','recommended','family',true,false,true,true,false,false,20,NULL),
('board_game','players_max','recommended','family',true,false,true,true,false,false,30,NULL),
('board_game','play_time_minutes','optional','family',true,false,true,true,false,false,40,NULL),
('board_game','language','recommended','variant',true,false,true,true,true,false,50,1);

-- Apparel and footwear; exact manufacturer colour, not normalized base colour, defines identity.
INSERT INTO _rule_seed
SELECT pt,attr,req,lvl,fil,sea,vis,cmp,var,multi,ord,axis FROM (VALUES
('apparel','gender','required','family',true,false,true,true,false,false,10,NULL),('apparel','material','recommended','family',true,false,true,true,false,true,20,NULL),('apparel','composition','recommended','family',false,true,true,false,false,false,30,NULL),('apparel','fit','optional','family',true,false,true,true,false,false,40,NULL),('apparel','pattern','optional','family',true,false,true,true,false,false,50,NULL),('apparel','manufacturer_colour','required','variant',false,true,true,false,true,false,60,1),('apparel','colour','recommended','variant',true,false,true,false,false,false,70,NULL),('apparel','apparel_size','required','variant',true,false,true,true,true,false,80,2),
('dress','gender','required','family',true,false,true,true,false,false,10,NULL),('dress','material','recommended','family',true,false,true,true,false,true,20,NULL),('dress','composition','recommended','family',false,true,true,false,false,false,30,NULL),('dress','fit','optional','family',true,false,true,true,false,false,40,NULL),('dress','pattern','optional','family',true,false,true,true,false,false,50,NULL),('dress','sleeve_length','optional','family',true,false,true,true,false,false,55,NULL),('dress','manufacturer_colour','required','variant',false,true,true,false,true,false,60,1),('dress','colour','recommended','variant',true,false,true,false,false,false,70,NULL),('dress','apparel_size','required','variant',true,false,true,true,true,false,80,2),
('shirt','gender','required','family',true,false,true,true,false,false,10,NULL),('shirt','material','recommended','family',true,false,true,true,false,true,20,NULL),('shirt','composition','recommended','family',false,true,true,false,false,false,30,NULL),('shirt','fit','optional','family',true,false,true,true,false,false,40,NULL),('shirt','pattern','optional','family',true,false,true,true,false,false,50,NULL),('shirt','sleeve_length','optional','family',true,false,true,true,false,false,55,NULL),('shirt','manufacturer_colour','required','variant',false,true,true,false,true,false,60,1),('shirt','colour','recommended','variant',true,false,true,false,false,false,70,NULL),('shirt','apparel_size','required','variant',true,false,true,true,true,false,80,2),
('top','gender','required','family',true,false,true,true,false,false,10,NULL),('top','material','recommended','family',true,false,true,true,false,true,20,NULL),('top','composition','recommended','family',false,true,true,false,false,false,30,NULL),('top','fit','optional','family',true,false,true,true,false,false,40,NULL),('top','pattern','optional','family',true,false,true,true,false,false,50,NULL),('top','manufacturer_colour','required','variant',false,true,true,false,true,false,60,1),('top','colour','recommended','variant',true,false,true,false,false,false,70,NULL),('top','apparel_size','required','variant',true,false,true,true,true,false,80,2),
('footwear','gender','required','family',true,false,true,true,false,false,10,NULL),('footwear','material','recommended','family',true,false,true,true,false,true,20,NULL),('footwear','manufacturer_colour','required','variant',false,true,true,false,true,false,30,1),('footwear','colour','recommended','variant',true,false,true,false,false,false,40,NULL),('footwear','footwear_size','required','variant',true,false,true,true,true,false,50,2),
('running_shoe','gender','required','family',true,false,true,true,false,false,10,NULL),('running_shoe','material','recommended','family',true,false,true,true,false,true,20,NULL),('running_shoe','manufacturer_colour','required','variant',false,true,true,false,true,false,30,1),('running_shoe','colour','recommended','variant',true,false,true,false,false,false,40,NULL),('running_shoe','footwear_size','required','variant',true,false,true,true,true,false,50,2)
) AS r(pt,attr,req,lvl,fil,sea,vis,cmp,var,multi,ord,axis);

-- Technology / beauty / tools / home / automotive / jewellery
INSERT INTO _rule_seed VALUES
('smartphone','operating_system','required','family',true,false,true,true,false,false,10,NULL),('smartphone','network_generation','recommended','family',true,false,true,true,false,false,20,NULL),('smartphone','screen_size_inches','recommended','family',true,false,true,true,false,false,30,NULL),('smartphone','storage_capacity_gb','required','variant',true,false,true,true,true,false,40,1),('smartphone','manufacturer_colour','required','variant',false,true,true,false,true,false,50,2),('smartphone','colour','recommended','variant',true,false,true,false,false,false,60,NULL),('smartphone','ram_gb','optional','variant',true,false,true,true,false,false,70,NULL),
('laptop','screen_size_inches','recommended','family',true,false,true,true,false,false,10,NULL),('laptop','operating_system','recommended','family',true,false,true,true,false,false,20,NULL),('laptop','processor','required','variant',true,true,true,true,true,false,30,1),('laptop','ram_gb','required','variant',true,false,true,true,true,false,40,2),('laptop','storage_capacity_gb','required','variant',true,false,true,true,true,false,50,3),('laptop','manufacturer_colour','optional','variant',false,true,true,false,true,false,60,4),('laptop','colour','optional','variant',true,false,true,false,false,false,70,NULL),
('television','screen_size_inches','required','variant',true,false,true,true,true,false,10,1),('television','operating_system','optional','family',true,false,true,true,false,false,20,NULL),('television','wireless','recommended','family',true,false,true,true,false,false,30,NULL),
('printer_consumable','pack_quantity','recommended','family',true,false,true,true,false,false,10,NULL),('printer_consumable','colour','recommended','family',true,false,true,true,false,true,20,NULL),
('fragrance','fragrance_concentration','required','family',true,false,true,true,false,false,10,NULL),('fragrance','fragrance_volume_ml','required','variant',true,false,true,true,true,false,20,1),
('makeup','shade_name','required','variant',false,true,true,false,true,false,10,1),('makeup','colour','recommended','variant',true,false,true,false,false,false,20,NULL),
('power_tool','tool_power_source','required','family',true,false,true,true,false,false,10,NULL),('power_tool','voltage_v','recommended','family',true,false,true,true,false,false,20,NULL),('power_tool','battery_platform','optional','family',true,true,true,true,false,false,30,NULL),
('tool_accessory','pack_quantity','optional','family',true,false,true,true,false,false,10,NULL),('tool_accessory','product_dimensions','optional','family',false,false,true,true,false,false,20,NULL),
('paint','paint_finish','recommended','family',true,false,true,true,false,false,10,NULL),('paint','paint_volume_l','required','variant',true,false,true,true,true,false,20,1),('paint','manufacturer_colour','optional','variant',false,true,true,false,true,false,30,2),('paint','colour','optional','variant',true,false,true,false,false,false,40,NULL),
('mattress','firmness','recommended','family',true,false,true,true,false,false,10,NULL),('mattress','mattress_width_cm','required','variant',true,false,true,true,true,false,20,1),('mattress','mattress_length_cm','required','variant',true,false,true,true,true,false,30,2),
('furniture','material','recommended','family',true,false,true,true,false,true,10,NULL),('furniture','product_dimensions','required','family',false,false,true,true,false,false,20,NULL),('furniture','manufacturer_colour','optional','variant',false,true,true,false,true,false,30,1),('furniture','colour','optional','variant',true,false,true,false,false,false,40,NULL),
('curtain_blind','material','recommended','family',true,false,true,true,false,true,10,NULL),('curtain_blind','curtain_width_cm','required','variant',true,false,true,true,true,false,20,1),('curtain_blind','curtain_drop_cm','required','variant',true,false,true,true,true,false,30,2),('curtain_blind','manufacturer_colour','required','variant',false,true,true,false,true,false,40,3),('curtain_blind','colour','recommended','variant',true,false,true,false,false,false,50,NULL),
('bicycle','wheel_size_inches','recommended','family',true,false,true,true,false,false,10,NULL),('bicycle','gear_count','optional','family',true,false,true,true,false,false,20,NULL),('bicycle','bicycle_frame_size','required','variant',true,false,true,true,true,false,30,1),('bicycle','manufacturer_colour','required','variant',false,true,true,false,true,false,40,2),('bicycle','colour','recommended','variant',true,false,true,false,false,false,50,NULL),
('vehicle_battery','voltage_v','required','family',true,false,true,true,false,false,10,NULL),('vehicle_battery','battery_capacity_ah','required','family',true,false,true,true,false,false,20,NULL),('vehicle_battery','battery_cca','recommended','family',true,false,true,true,false,false,30,NULL),('vehicle_battery','product_dimensions','recommended','family',false,false,true,true,false,false,40,NULL),
('tyre','tyre_width_mm','required','variant',true,false,true,true,true,false,10,1),('tyre','tyre_aspect_ratio','required','variant',true,false,true,true,true,false,20,2),('tyre','tyre_rim_inches','required','variant',true,false,true,true,true,false,30,3),('tyre','tyre_load_index','recommended','variant',true,false,true,true,false,false,40,NULL),('tyre','tyre_speed_rating','recommended','variant',true,false,true,true,false,false,50,NULL),
('automotive_part','product_dimensions','optional','family',false,false,true,true,false,false,10,NULL),
('jewellery','jewellery_material','required','family',true,false,true,true,false,false,10,NULL),('jewellery','gemstone','optional','family',true,true,true,true,false,false,20,NULL),('jewellery','manufacturer_colour','optional','variant',false,true,true,false,true,false,30,1),('jewellery','colour','optional','variant',true,false,true,false,false,false,40,NULL),('jewellery','ring_size','optional','variant',true,false,true,true,true,false,50,2),
('lighting_fixture','material','optional','family',true,false,true,true,false,true,10,NULL),('lighting_fixture','product_dimensions','recommended','family',false,false,true,true,false,false,20,NULL),('lighting_fixture','manufacturer_colour','optional','variant',false,true,true,false,true,false,30,1),('lighting_fixture','colour','optional','variant',true,false,true,false,false,false,40,NULL),
('homeware','material','recommended','family',true,false,true,true,false,true,10,NULL),('homeware','product_dimensions','optional','family',false,false,true,true,false,false,20,NULL),('homeware','manufacturer_colour','optional','variant',false,true,true,false,true,false,30,1),('homeware','colour','optional','variant',true,false,true,false,false,false,40,NULL),
('packaging','material','recommended','family',true,false,true,true,false,true,10,NULL),('packaging','product_dimensions','recommended','family',false,false,true,true,false,false,20,NULL),('packaging','pack_quantity','recommended','variant',true,false,true,true,true,false,30,1),
('ceremonial_good','material','optional','family',true,false,true,true,false,true,10,NULL),('ceremonial_good','manufacturer_colour','optional','variant',false,true,true,false,true,false,20,1),('ceremonial_good','colour','optional','variant',true,false,true,false,false,false,30,NULL),
('medical_device','product_dimensions','optional','family',false,false,true,true,false,false,10,NULL),('medical_device','material','optional','family',true,false,true,true,false,true,20,NULL);

INSERT INTO product_type_attributes(product_type_id,attribute_id,requirement_level,value_level,filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order,variant_axis_order)
SELECT pt.id,ad.id,r.requirement_level,r.value_level,r.filterable,r.searchable,r.customer_visible,r.comparable,r.variant_defining,r.allow_multiple,r.sort_order,r.variant_axis_order
FROM _rule_seed r JOIN product_types pt ON pt.code=r.product_type_code JOIN attribute_definitions ad ON ad.code=r.attribute_code
ON CONFLICT (product_type_id,attribute_id) DO UPDATE SET requirement_level=EXCLUDED.requirement_level,value_level=EXCLUDED.value_level,filterable=EXCLUDED.filterable,searchable=EXCLUDED.searchable,customer_visible=EXCLUDED.customer_visible,comparable=EXCLUDED.comparable,variant_defining=EXCLUDED.variant_defining,allow_multiple=EXCLUDED.allow_multiple,sort_order=EXCLUDED.sort_order,variant_axis_order=EXCLUDED.variant_axis_order,updated_at=now();

-- Assign Product Types to all currently materialized product families from category defaults.
UPDATE product_families pf
SET product_type_id=cpt.product_type_id, updated_at=now()
FROM category_product_types cpt
WHERE cpt.category_id=pf.category_id AND cpt.is_default=true AND pf.product_type_id IS NULL;

-- Migrate exact manufacturer colour source claims from current apparel JSON into typed values.
INSERT INTO canonical_variant_attribute_values(canonical_variant_id,attribute_id,position,text_value,source,confidence)
SELECT cv.id,ad.id,0,coalesce(nullif(btrim(cv.variant_attributes->>'color'),''),nullif(btrim(cv.variant_attributes->>'colour'),'')),'migration',1.00000
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id
JOIN attribute_definitions ad ON ad.code='manufacturer_colour'
WHERE pt.code IN ('apparel','dress','shirt','top','footwear','running_shoe')
  AND coalesce(nullif(btrim(cv.variant_attributes->>'color'),''),nullif(btrim(cv.variant_attributes->>'colour'),'')) IS NOT NULL
ON CONFLICT (canonical_variant_id,attribute_id,position) DO NOTHING;

COMMIT;

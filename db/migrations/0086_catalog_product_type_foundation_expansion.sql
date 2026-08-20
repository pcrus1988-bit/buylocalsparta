BEGIN;

CREATE TEMP TABLE _attribute_seed (
  code text PRIMARY KEY, data_type text NOT NULL, unit text, value_mode text NOT NULL, group_code text,
  label_el text NOT NULL, label_en text NOT NULL
) ON COMMIT DROP;

INSERT INTO _attribute_seed VALUES
('product_weight_kg','number','kg','free','dimensions','Βάρος προϊόντος','Product weight'),
('capacity_l','number','L','free','dimensions','Χωρητικότητα','Capacity'),
('volume_ml','number','ml','free','dimensions','Όγκος','Volume'),
('power_w','number','W','free','electrical','Ισχύς','Power'),
('battery_capacity_mah','number','mAh','free','technology','Χωρητικότητα μπαταρίας','Battery capacity'),
('energy_class','enum',NULL,'controlled','electrical','Ενεργειακή κλάση','Energy class'),
('installation_type','enum',NULL,'controlled','usage','Τύπος εγκατάστασης','Installation type'),
('connectivity','multienum',NULL,'controlled','technology','Συνδεσιμότητα','Connectivity'),
('display_resolution','text',NULL,'free','technology','Ανάλυση οθόνης','Display resolution'),
('refresh_rate_hz','number','Hz','free','technology','Ρυθμός ανανέωσης','Refresh rate'),
('storage_type','enum',NULL,'controlled','technology','Τύπος αποθήκευσης','Storage type'),
('camera_resolution_mp','number','MP','free','photography','Ανάλυση κάμερας','Camera resolution'),
('lens_mount','text',NULL,'free','photography','Μοντούρα φακού','Lens mount'),
('focal_length_mm','text','mm','free','photography','Εστιακή απόσταση','Focal length'),
('watch_movement','enum',NULL,'controlled','watch','Μηχανισμός ρολογιού','Watch movement'),
('case_size_mm','number','mm','free','watch','Διάμετρος κάσας','Case size'),
('water_resistance_m','number','m','free','watch','Αντοχή στο νερό','Water resistance'),
('lens_type','enum',NULL,'controlled','optical','Τύπος φακού','Lens type'),
('spf','number','SPF','free','beauty','Δείκτης SPF','SPF'),
('skin_type','enum',NULL,'controlled','beauty','Τύπος δέρματος','Skin type'),
('hair_type','enum',NULL,'controlled','beauty','Τύπος μαλλιών','Hair type'),
('formulation','enum',NULL,'controlled','beauty','Μορφή προϊόντος','Formulation'),
('pet_type','enum',NULL,'controlled','pet','Τύπος κατοικιδίου','Pet type'),
('tent_capacity_people','number','people','free','outdoor','Χωρητικότητα ατόμων','People capacity'),
('compatibility','text',NULL,'free','compatibility','Συμβατότητα','Compatibility'),
('pipe_diameter_mm','number','mm','free','plumbing','Διάμετρος σωλήνα','Pipe diameter'),
('door_width_cm','number','cm','free','dimensions','Πλάτος πόρτας / ανοίγματος','Door / opening width'),
('door_height_cm','number','cm','free','dimensions','Ύψος πόρτας / ανοίγματος','Door / opening height'),
('finish','enum',NULL,'controlled','appearance','Φινίρισμα','Finish'),
('opening_type','enum',NULL,'controlled','construction','Τύπος ανοίγματος','Opening type'),
('glass_type','enum',NULL,'controlled','construction','Τύπος υαλοπίνακα','Glass type'),
('bulb_base','text',NULL,'free','lighting','Ντουί / βάση λαμπτήρα','Bulb base'),
('colour_temperature_k','number','K','free','lighting','Θερμοκρασία χρώματος','Colour temperature'),
('luminous_flux_lm','number','lm','free','lighting','Φωτεινή ροή','Luminous flux'),
('load_capacity_kg','number','kg','free','dimensions','Ικανότητα φορτίου','Load capacity'),
('noise_db','number','dB','free','electrical','Επίπεδο θορύβου','Noise level'),
('protection_rating','text',NULL,'free','technical','Βαθμός προστασίας','Protection rating'),
('cable_length_m','number','m','free','dimensions','Μήκος καλωδίου','Cable length'),
('irrigation_flow_l_min','number','L/min','free','agriculture','Παροχή νερού','Water flow'),
('pot_diameter_cm','number','cm','free','garden','Διάμετρος γλάστρας','Pot diameter'),
('fuel_type','enum',NULL,'controlled','automotive','Τύπος καυσίμου / κίνησης','Fuel / drivetrain type'),
('transmission','enum',NULL,'controlled','automotive','Κιβώτιο ταχυτήτων','Transmission'),
('engine_displacement_cc','number','cc','free','automotive','Κυβισμός κινητήρα','Engine displacement'),
('model_year','number','year','free','identity','Έτος μοντέλου','Model year'),
('manufacturer_variant','text',NULL,'free','identity','Παραλλαγή κατασκευαστή','Manufacturer variant'),
('power_source','enum',NULL,'controlled','electrical','Τροφοδοσία','Power source'),
('panel_type','enum',NULL,'controlled','technology','Τύπος panel','Panel type');

INSERT INTO attribute_definitions(code,data_type,unit,value_mode,group_code,variant_identity,filterable,values,active,updated_at)
SELECT code,data_type,unit,value_mode,group_code,false,true,'[]'::jsonb,true,now()
FROM _attribute_seed
ON CONFLICT (code) DO UPDATE SET
  data_type=EXCLUDED.data_type,
  unit=EXCLUDED.unit,
  value_mode=EXCLUDED.value_mode,
  group_code=EXCLUDED.group_code,
  active=true,
  updated_at=now();

INSERT INTO attribute_translations(attribute_id,locale,label)
SELECT ad.id,'el',s.label_el FROM _attribute_seed s JOIN attribute_definitions ad ON ad.code=s.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO attribute_translations(attribute_id,locale,label)
SELECT ad.id,'en',s.label_en FROM _attribute_seed s JOIN attribute_definitions ad ON ad.code=s.code
ON CONFLICT (attribute_id,locale) DO UPDATE SET label=EXCLUDED.label;

CREATE TEMP TABLE _value_seed (
  attribute_code text NOT NULL, value_code text NOT NULL, label_el text NOT NULL, label_en text NOT NULL,
  sort_order integer NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(attribute_code,value_code)
) ON COMMIT DROP;

INSERT INTO _value_seed VALUES
('colour','navy','Navy / σκούρο μπλε','Navy',170,'{"hex": "#000080"}'::jsonb),
('colour','cream','Κρεμ','Cream',180,'{"hex": "#FFFDD0"}'::jsonb),
('colour','ivory','Ιβουάρ','Ivory',190,'{"hex": "#FFFFF0"}'::jsonb),
('colour','anthracite','Ανθρακί','Anthracite',200,'{"hex": "#383E42"}'::jsonb),
('colour','burgundy','Μπορντό','Burgundy',210,'{"hex": "#800020"}'::jsonb),
('colour','lilac','Λιλά','Lilac',220,'{"hex": "#C8A2C8"}'::jsonb),
('colour','olive','Λαδί','Olive',230,'{"hex": "#808000"}'::jsonb),
('colour','khaki','Χακί','Khaki',240,'{"hex": "#BDB76B"}'::jsonb),
('colour','turquoise','Τιρκουάζ','Turquoise',250,'{"hex": "#40E0D0"}'::jsonb),
('colour','teal','Πετρόλ','Teal',260,'{"hex": "#008080"}'::jsonb),
('colour','rose-gold','Ροζ χρυσό','Rose gold',270,'{}'::jsonb),
('colour','copper','Χάλκινο','Copper',280,'{}'::jsonb),
('colour','bronze','Μπρονζέ','Bronze',290,'{}'::jsonb),
('colour','transparent','Διάφανο','Transparent',300,'{}'::jsonb),
('energy_class','A','A','A',10,'{}'::jsonb),
('energy_class','B','B','B',20,'{}'::jsonb),
('energy_class','C','C','C',30,'{}'::jsonb),
('energy_class','D','D','D',40,'{}'::jsonb),
('energy_class','E','E','E',50,'{}'::jsonb),
('energy_class','F','F','F',60,'{}'::jsonb),
('energy_class','G','G','G',70,'{}'::jsonb),
('installation_type','freestanding','Ελεύθερη τοποθέτηση','Freestanding',10,'{}'::jsonb),
('installation_type','built-in','Εντοιχιζόμενο','Built-in',20,'{}'::jsonb),
('installation_type','wall-mounted','Επιτοίχιο','Wall-mounted',30,'{}'::jsonb),
('installation_type','portable','Φορητό','Portable',40,'{}'::jsonb),
('installation_type','countertop','Πάγκου','Countertop',50,'{}'::jsonb),
('connectivity','wifi','Wi‑Fi','Wi‑Fi',10,'{}'::jsonb),
('connectivity','bluetooth','Bluetooth','Bluetooth',20,'{}'::jsonb),
('connectivity','ethernet','Ethernet','Ethernet',30,'{}'::jsonb),
('connectivity','usb','USB','USB',40,'{}'::jsonb),
('connectivity','nfc','NFC','NFC',50,'{}'::jsonb),
('connectivity','cellular','Κινητό δίκτυο','Cellular',60,'{}'::jsonb),
('connectivity','zigbee','Zigbee','Zigbee',70,'{}'::jsonb),
('connectivity','other','Άλλο','Other',80,'{}'::jsonb),
('storage_type','hdd','HDD','HDD',10,'{}'::jsonb),
('storage_type','ssd','SSD','SSD',20,'{}'::jsonb),
('storage_type','emmc','eMMC','eMMC',30,'{}'::jsonb),
('storage_type','ufs','UFS','UFS',40,'{}'::jsonb),
('storage_type','microsd','microSD','microSD',50,'{}'::jsonb),
('storage_type','other','Άλλο','Other',60,'{}'::jsonb),
('watch_movement','quartz','Quartz','Quartz',10,'{}'::jsonb),
('watch_movement','automatic','Αυτόματος','Automatic',20,'{}'::jsonb),
('watch_movement','mechanical','Μηχανικός','Mechanical',30,'{}'::jsonb),
('watch_movement','digital','Ψηφιακός','Digital',40,'{}'::jsonb),
('watch_movement','smart','Smartwatch','Smartwatch',50,'{}'::jsonb),
('lens_type','clear','Διαφανής','Clear',10,'{}'::jsonb),
('lens_type','sunglass','Ηλίου','Sunglass',20,'{}'::jsonb),
('lens_type','polarized','Πολωτικός','Polarized',30,'{}'::jsonb),
('lens_type','photochromic','Φωτοχρωμικός','Photochromic',40,'{}'::jsonb),
('lens_type','blue-light','Φίλτρο μπλε φωτός','Blue-light filter',50,'{}'::jsonb),
('lens_type','reading','Ανάγνωσης','Reading',60,'{}'::jsonb),
('lens_type','other','Άλλο','Other',70,'{}'::jsonb),
('skin_type','normal','Κανονικό','Normal',10,'{}'::jsonb),
('skin_type','dry','Ξηρό','Dry',20,'{}'::jsonb),
('skin_type','oily','Λιπαρό','Oily',30,'{}'::jsonb),
('skin_type','combination','Μικτό','Combination',40,'{}'::jsonb),
('skin_type','sensitive','Ευαίσθητο','Sensitive',50,'{}'::jsonb),
('skin_type','all','Όλοι οι τύποι','All skin types',60,'{}'::jsonb),
('hair_type','normal','Κανονικά','Normal',10,'{}'::jsonb),
('hair_type','dry','Ξηρά','Dry',20,'{}'::jsonb),
('hair_type','oily','Λιπαρά','Oily',30,'{}'::jsonb),
('hair_type','curly','Σγουρά','Curly',40,'{}'::jsonb),
('hair_type','damaged','Ταλαιπωρημένα','Damaged',50,'{}'::jsonb),
('hair_type','coloured','Βαμμένα','Colour-treated',60,'{}'::jsonb),
('hair_type','all','Όλοι οι τύποι','All hair types',70,'{}'::jsonb),
('formulation','cream','Κρέμα','Cream',10,'{}'::jsonb),
('formulation','gel','Gel','Gel',20,'{}'::jsonb),
('formulation','serum','Serum','Serum',30,'{}'::jsonb),
('formulation','oil','Λάδι','Oil',40,'{}'::jsonb),
('formulation','lotion','Λοσιόν','Lotion',50,'{}'::jsonb),
('formulation','spray','Spray','Spray',60,'{}'::jsonb),
('formulation','foam','Αφρός','Foam',70,'{}'::jsonb),
('formulation','liquid','Υγρό','Liquid',80,'{}'::jsonb),
('formulation','powder','Πούδρα','Powder',90,'{}'::jsonb),
('formulation','stick','Stick','Stick',100,'{}'::jsonb),
('pet_type','dog','Σκύλος','Dog',10,'{}'::jsonb),
('pet_type','cat','Γάτα','Cat',20,'{}'::jsonb),
('pet_type','bird','Πτηνό','Bird',30,'{}'::jsonb),
('pet_type','fish','Ψάρι','Fish',40,'{}'::jsonb),
('pet_type','small-animal','Μικρό ζώο','Small animal',50,'{}'::jsonb),
('pet_type','reptile','Ερπετό','Reptile',60,'{}'::jsonb),
('pet_type','universal','Γενικής χρήσης','Universal',70,'{}'::jsonb),
('finish','matte','Ματ','Matte',10,'{}'::jsonb),
('finish','gloss','Γυαλιστερό','Gloss',20,'{}'::jsonb),
('finish','satin','Σατινέ','Satin',30,'{}'::jsonb),
('finish','brushed','Βουρτσισμένο','Brushed',40,'{}'::jsonb),
('finish','polished','Γυαλισμένο','Polished',50,'{}'::jsonb),
('finish','natural','Φυσικό','Natural',60,'{}'::jsonb),
('opening_type','sliding','Συρόμενο','Sliding',10,'{}'::jsonb),
('opening_type','casement','Ανοιγόμενο','Casement',20,'{}'::jsonb),
('opening_type','tilt-turn','Ανοιγόμενο / ανακλινόμενο','Tilt & turn',30,'{}'::jsonb),
('opening_type','fixed','Σταθερό','Fixed',40,'{}'::jsonb),
('opening_type','folding','Πτυσσόμενο','Folding',50,'{}'::jsonb),
('opening_type','other','Άλλο','Other',60,'{}'::jsonb),
('glass_type','clear','Διάφανο','Clear',10,'{}'::jsonb),
('glass_type','frosted','Ματ','Frosted',20,'{}'::jsonb),
('glass_type','tempered','Tempered / ασφαλείας','Tempered',30,'{}'::jsonb),
('glass_type','laminated','Laminated','Laminated',40,'{}'::jsonb),
('glass_type','double-glazed','Διπλός υαλοπίνακας','Double glazed',50,'{}'::jsonb),
('glass_type','other','Άλλο','Other',60,'{}'::jsonb),
('fuel_type','petrol','Βενζίνη','Petrol',10,'{}'::jsonb),
('fuel_type','diesel','Πετρέλαιο','Diesel',20,'{}'::jsonb),
('fuel_type','hybrid','Υβριδικό','Hybrid',30,'{}'::jsonb),
('fuel_type','electric','Ηλεκτρικό','Electric',40,'{}'::jsonb),
('fuel_type','lpg','LPG','LPG',50,'{}'::jsonb),
('fuel_type','other','Άλλο','Other',60,'{}'::jsonb),
('transmission','manual','Χειροκίνητο','Manual',10,'{}'::jsonb),
('transmission','automatic','Αυτόματο','Automatic',20,'{}'::jsonb),
('transmission','other','Άλλο','Other',30,'{}'::jsonb),
('power_source','mains','Ρεύμα','Mains',10,'{}'::jsonb),
('power_source','battery','Μπαταρία','Battery',20,'{}'::jsonb),
('power_source','rechargeable','Επαναφορτιζόμενο','Rechargeable',30,'{}'::jsonb),
('power_source','manual','Χειροκίνητο','Manual',40,'{}'::jsonb),
('power_source','gas','Αέριο','Gas',50,'{}'::jsonb),
('power_source','solar','Ηλιακό','Solar',60,'{}'::jsonb),
('power_source','fuel','Καύσιμο','Fuel',70,'{}'::jsonb),
('panel_type','lcd','LCD','LCD',10,'{}'::jsonb),
('panel_type','led','LED','LED',20,'{}'::jsonb),
('panel_type','ips','IPS','IPS',30,'{}'::jsonb),
('panel_type','va','VA','VA',40,'{}'::jsonb),
('panel_type','tn','TN','TN',50,'{}'::jsonb),
('panel_type','oled','OLED','OLED',60,'{}'::jsonb),
('panel_type','qled','QLED','QLED',70,'{}'::jsonb),
('panel_type','e-ink','E‑ink','E‑ink',80,'{}'::jsonb),
('panel_type','other','Άλλο','Other',90,'{}'::jsonb);

INSERT INTO attribute_values(attribute_id,code,sort_order,active,metadata,updated_at)
SELECT ad.id,s.value_code,s.sort_order,true,s.metadata,now()
FROM _value_seed s JOIN attribute_definitions ad ON ad.code=s.attribute_code
ON CONFLICT (attribute_id,code) DO UPDATE SET
  sort_order=EXCLUDED.sort_order,active=true,metadata=EXCLUDED.metadata,updated_at=now();

INSERT INTO attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'el',s.label_el
FROM _value_seed s JOIN attribute_definitions ad ON ad.code=s.attribute_code
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,'en',s.label_en
FROM _value_seed s JOIN attribute_definitions ad ON ad.code=s.attribute_code
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=s.value_code
ON CONFLICT (attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

CREATE TEMP TABLE _product_type_seed (
 code text PRIMARY KEY,name_el text NOT NULL,name_en text NOT NULL,product_mode text NOT NULL,variant_strategy text NOT NULL
) ON COMMIT DROP;

INSERT INTO _product_type_seed VALUES
('agricultural_supply','Γεωργικό εφόδιο','Agricultural supply','standard','matrix'),
('aquatics_supply','Είδος ενυδρείου','Aquatics supply','standard','matrix'),
('art_craft_supply','Είδος τέχνης & χειροτεχνίας','Art & craft supply','standard','matrix'),
('automotive_fluid','Υγρό / προϊόν περιποίησης οχήματος','Automotive fluid / care product','standard','matrix'),
('bag','Τσάντα / σακίδιο','Bag / backpack','standard','matrix'),
('beauty_care','Προϊόν προσωπικής φροντίδας','Personal care product','standard','matrix'),
('beauty_tool','Εργαλείο ομορφιάς','Beauty tool','standard','matrix'),
('beekeeping_supply','Μελισσοκομικό είδος','Beekeeping supply','standard','matrix'),
('bicycle_component','Ανταλλακτικό / αξεσουάρ ποδηλάτου','Bicycle component / accessory','standard','matrix'),
('building_material','Οικοδομικό υλικό','Building material','standard','matrix'),
('business_equipment','Επαγγελματικός εξοπλισμός','Business equipment','standard','matrix'),
('business_supply','Επαγγελματικό αναλώσιμο / εξοπλισμός προβολής','Business supply / merchandising equipment','standard','matrix'),
('camera','Φωτογραφική μηχανή','Camera','standard','matrix'),
('camera_accessory','Αξεσουάρ φωτογραφίας','Camera accessory','standard','matrix'),
('camera_lens','Φακός φωτογραφικής μηχανής','Camera lens','standard','matrix'),
('collectible','Συλλεκτικό είδος','Collectible','standard','matrix'),
('computer_component','Εξάρτημα υπολογιστή','Computer component','standard','matrix'),
('computer_peripheral','Περιφερειακό υπολογιστή','Computer peripheral','standard','matrix'),
('computer_storage','Αποθηκευτικό μέσο','Computer storage','standard','matrix'),
('consumer_electronics','Ηλεκτρονική συσκευή','Consumer electronics','standard','matrix'),
('desktop_computer','Σταθερός υπολογιστής','Desktop computer','standard','matrix'),
('door_window','Πόρτα / παράθυρο / εξάρτημα','Door / window / hardware','configurable','configurable'),
('electrical_supply','Ηλεκτρολογικό υλικό','Electrical supply','standard','matrix'),
('eyewear','Οπτικό είδος','Eyewear','standard','matrix'),
('fashion_accessory','Αξεσουάρ μόδας','Fashion accessory','standard','matrix'),
('garden_supply','Είδος κήπου','Garden supply','standard','matrix'),
('gift_item','Δώρο / εποχιακό είδος','Gift / seasonal item','standard','matrix'),
('haircare','Προϊόν περιποίησης μαλλιών','Haircare product','standard','matrix'),
('hand_tool','Εργαλείο χειρός','Hand tool','standard','none'),
('hardware_item','Σιδηρικό / στερεωτικό','Hardware / fastener','standard','matrix'),
('heating_cooling_appliance','Συσκευή θέρμανσης / ψύξης','Heating / cooling appliance','standard','matrix'),
('home_decor','Διακοσμητικό σπιτιού','Home decor item','standard','matrix'),
('home_textile','Οικιακό ύφασμα','Home textile','standard','matrix'),
('irrigation_equipment','Εξοπλισμός άρδευσης','Irrigation equipment','standard','matrix'),
('large_appliance','Μεγάλη οικιακή συσκευή','Large appliance','standard','matrix'),
('lighting_component','Λαμπτήρας / εξάρτημα φωτισμού','Lighting component','standard','matrix'),
('mobile_accessory','Αξεσουάρ κινητού','Mobile accessory','standard','matrix'),
('monitor','Οθόνη υπολογιστή','Computer monitor','standard','matrix'),
('musical_instrument','Μουσικό όργανο / αξεσουάρ','Musical instrument / accessory','standard','matrix'),
('network_device','Δικτυακή συσκευή','Network device','standard','matrix'),
('outdoor_equipment','Εξοπλισμός υπαίθρου','Outdoor equipment','standard','matrix'),
('pet_supply','Είδος κατοικιδίου','Pet supply','standard','matrix'),
('plant','Φυτό','Plant','standard','matrix'),
('plumbing_fixture','Υδραυλικό / είδος υγιεινής','Plumbing / sanitary item','standard','matrix'),
('ppe','Μέσο ατομικής προστασίας','Personal protective equipment','standard','matrix'),
('printer_scanner','Εκτυπωτής / σαρωτής','Printer / scanner','standard','matrix'),
('security_device','Συσκευή ασφαλείας','Security device','standard','matrix'),
('skincare','Προϊόν περιποίησης προσώπου','Skincare product','standard','matrix'),
('small_appliance','Μικρή οικιακή συσκευή','Small appliance','standard','matrix'),
('sports_equipment','Αθλητικός εξοπλισμός','Sports equipment','standard','matrix'),
('stationery_supply','Χαρτικό / σχολικό / γραφειακό είδος','Stationery / school / office supply','standard','matrix'),
('sun_care','Αντηλιακό προϊόν','Sun care product','standard','matrix'),
('vehicle','Όχημα / μοτοσυκλέτα','Vehicle / motorcycle','standard','none'),
('vehicle_accessory','Αξεσουάρ οχήματος','Vehicle accessory','standard','matrix'),
('vehicle_electronics','Ηλεκτρονικό οχήματος','Vehicle electronics','standard','matrix'),
('watch','Ρολόι','Watch','standard','matrix'),
('writing_instrument','Είδος γραφής','Writing instrument','standard','matrix');

INSERT INTO product_types(code,status,product_mode,variant_strategy,updated_at)
SELECT code,'active',product_mode,variant_strategy,now()
FROM _product_type_seed
ON CONFLICT (code) DO UPDATE SET
 status='active',product_mode=EXCLUDED.product_mode,variant_strategy=EXCLUDED.variant_strategy,updated_at=now();

INSERT INTO product_type_translations(product_type_id,locale,name)
SELECT pt.id,'el',s.name_el FROM _product_type_seed s JOIN product_types pt ON pt.code=s.code
ON CONFLICT (product_type_id,locale) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO product_type_translations(product_type_id,locale,name)
SELECT pt.id,'en',s.name_en FROM _product_type_seed s JOIN product_types pt ON pt.code=s.code
ON CONFLICT (product_type_id,locale) DO UPDATE SET name=EXCLUDED.name;

COMMIT;

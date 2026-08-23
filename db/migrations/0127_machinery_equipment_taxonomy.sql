-- Buy Local Sparta — reusable machinery/equipment taxonomy expansion.
--
-- Adds missing product-class categories exposed by supplier catalogue evidence
-- without coupling the KONTAMOU taxonomy to one supplier. Categories reuse the
-- nearest established generic product type for current filtering/variant
-- behavior; richer type-specific attributes can evolve independently later.
--
-- Safety:
-- - no canonical product, VendorOffer, inventory, price or publication writes
-- - no supplier-source mappings
-- - idempotent across reruns
-- - refuses slug/code collisions and missing parent/product-type dependencies

BEGIN;

CREATE TEMP TABLE taxonomy_0127_definitions (
  code text PRIMARY KEY,
  parent_code text NOT NULL,
  product_type_code text NOT NULL,
  sort_order integer NOT NULL,
  name_el text NOT NULL,
  name_en text NOT NULL,
  description_el text NOT NULL,
  description_en text NOT NULL
) ON COMMIT DROP;

INSERT INTO taxonomy_0127_definitions (
  code, parent_code, product_type_code, sort_order,
  name_el, name_en, description_el, description_en
)
VALUES
  ('wheels-casters','hardware-tools-paint','hardware_item',70,'Ρόδες & Ροδάκια','Wheels & Casters','Ρόδες, ροδάκια επίπλων και βιομηχανικοί τροχοί για εξοπλισμό και μεταφορά.','Wheels, furniture casters and industrial wheels for equipment and material movement.'),
  ('material-handling-equipment','hardware-tools-paint','business_equipment',80,'Εξοπλισμός Διακίνησης Φορτίων','Material Handling Equipment','Καρότσια, παλετοφόρα, περονοφόρα και εξοπλισμός χειρισμού και μεταφοράς φορτίων.','Trolleys, pallet trucks, forklifts and equipment for handling and moving loads.'),
  ('lifting-hoists-winches','hardware-tools-paint','business_equipment',90,'Ανυψωτικά, Παλάγκα & Εργάτες','Lifting, Hoists & Winches','Παλάγκα, εργάτες, βραχίονες και λοιπός εξοπλισμός ανύψωσης και έλξης.','Hoists, winches, lifting arms and related lifting and pulling equipment.'),
  ('air-compressors','hardware-tools-paint','power_tool',100,'Αεροσυμπιεστές','Air Compressors','Ηλεκτρικοί, φορητοί και επαγγελματικοί αεροσυμπιεστές.','Electric, portable and professional air compressors.'),
  ('pressure-washers','hardware-tools-paint','power_tool',110,'Πλυστικά Υψηλής Πίεσης','Pressure Washers','Ηλεκτρικά, βενζινοκίνητα και μπαταρίας πλυστικά υψηλής πίεσης.','Electric, petrol and battery-powered high-pressure washers.'),
  ('cleaning-machinery','hardware-tools-paint','business_equipment',120,'Μηχανήματα Καθαρισμού','Cleaning Machinery','Επαγγελματικά μηχανήματα πλύσης, σάρωσης και μηχανοποιημένου καθαρισμού.','Professional washing, sweeping and mechanized cleaning equipment.'),
  ('workshop-machinery','hardware-tools-paint','power_tool',130,'Μηχανήματα Εργαστηρίου & Κατεργασίας','Workshop & Machining Equipment','Σταθερά μηχανήματα κατεργασίας ξύλου και μετάλλου για εργαστήριο και συνεργείο.','Stationary woodworking and metalworking machinery for workshop and trade use.'),
  ('construction-machinery','hardware-tools-paint','power_tool',140,'Μηχανήματα Οικοδομής','Construction Machinery','Μηχανήματα κοπής, ανάμιξης, δόνησης, λείανσης και συμπύκνωσης για οικοδομικές εργασίες.','Cutting, mixing, vibrating, finishing and compaction machinery for construction work.'),
  ('welding-equipment','hardware-tools-paint','power_tool',150,'Εξοπλισμός Συγκόλλησης','Welding Equipment','Ηλεκτροσυγκολλήσεις, MIG, TIG, inverter και μηχανήματα κοπής plasma.','Arc, MIG, TIG and inverter welders plus plasma cutting equipment.'),
  ('garden-power-equipment','agricultural-supplies-machinery','agricultural_supply',40,'Μηχανήματα Κήπου','Garden Power Equipment','Μηχανοκίνητα και ηλεκτρικά μηχανήματα κήπου, κοπής, κλαδέματος και κατεργασίας εδάφους.','Powered garden equipment for cutting, pruning, lawn care and soil cultivation.'),
  ('generators-power-equipment','electrical-security-business-equipment','power_tool',60,'Γεννήτριες & Ηλεκτροπαραγωγά Ζεύγη','Generators & Power Equipment','Γεννήτριες βενζίνης, πετρελαίου και inverter για φορητή ή εφεδρική ηλεκτροπαραγωγή.','Petrol, diesel and inverter generators for portable and backup power generation.'),
  ('generator-controls-accessories','electrical-security-business-equipment','tool_accessory',70,'Αυτοματισμοί & Εξαρτήματα Γεννητριών','Generator Controls & Accessories','Συστήματα αυτοματισμού, μεταγωγής και εξαρτήματα ελέγχου γεννητριών.','Automation, transfer and control accessories for generator systems.'),
  ('weighing-equipment','electrical-security-business-equipment','business_equipment',80,'Ζυγιστικός Εξοπλισμός','Weighing Equipment','Επαγγελματικές, εργαστηριακές, ακριβείας, κρεμαστές και πλατφόρμες ζύγισης.','Professional, laboratory, precision, hanging and platform weighing equipment.');

DO $$
DECLARE
  v_definition_count integer;
  v_market_count integer;
  v_resolved_count integer;
  v_category_count integer;
  v_translation_count integer;
  v_type_link_count integer;
BEGIN
  SELECT count(*) INTO v_definition_count FROM taxonomy_0127_definitions;
  IF v_definition_count <> 13 THEN
    RAISE EXCEPTION '0127 taxonomy definition assertion failed: expected 13 definitions, got %', v_definition_count;
  END IF;

  SELECT count(*) INTO v_market_count FROM public.markets;
  IF v_market_count = 0 THEN
    RAISE EXCEPTION '0127 taxonomy expansion requires at least one market';
  END IF;

  SELECT count(*) INTO v_resolved_count
  FROM public.markets m
  CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories parent ON parent.market_id=m.id AND parent.code=d.parent_code AND parent.active=true
  JOIN public.product_types pt ON pt.code=d.product_type_code AND pt.status='active';

  IF v_resolved_count <> v_definition_count * v_market_count THEN
    RAISE EXCEPTION '0127 taxonomy dependency assertion failed: expected % resolved market/definition pairs, got %', v_definition_count*v_market_count, v_resolved_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.markets m
    CROSS JOIN taxonomy_0127_definitions d
    JOIN public.categories c ON c.market_id=m.id AND lower(c.slug)=lower(d.code) AND c.code<>d.code
  ) THEN
    RAISE EXCEPTION '0127 taxonomy slug collision found for an existing category';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.markets m
    CROSS JOIN taxonomy_0127_definitions d
    JOIN public.categories c ON c.market_id=m.id AND c.code=d.code AND lower(c.slug)<>lower(d.code)
  ) THEN
    RAISE EXCEPTION '0127 taxonomy code collision found for an existing category';
  END IF;

  INSERT INTO public.categories (
    id,market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
    require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,advice_allowed,
    checkout_fulfilment_modes,taxonomy_role,assignable,discoverable,sort_order,created_at,updated_at
  )
  SELECT
    gen_random_uuid(),m.id,parent.id,d.code,d.code,'standard',true,'{}'::jsonb,'{}'::jsonb,
    false,false,true,true,ARRAY['pickup','local_delivery','shipping']::text[],
    'product_class',true,true,d.sort_order,now(),now()
  FROM public.markets m
  CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories parent ON parent.market_id=m.id AND parent.code=d.parent_code AND parent.active=true
  ON CONFLICT (market_id,slug) DO UPDATE
  SET parent_id=EXCLUDED.parent_id,
      code=EXCLUDED.code,
      active=true,
      taxonomy_role='product_class',
      assignable=true,
      discoverable=true,
      updated_at=now();

  INSERT INTO public.category_translations (category_id,locale,name,description,seo_title,seo_description)
  SELECT
    c.id,v.locale,
    CASE v.locale WHEN 'el-GR' THEN d.name_el ELSE d.name_en END,
    CASE v.locale WHEN 'el-GR' THEN d.description_el ELSE d.description_en END,
    CASE v.locale WHEN 'el-GR' THEN d.name_el ELSE d.name_en END,
    CASE v.locale WHEN 'el-GR' THEN d.description_el ELSE d.description_en END
  FROM public.markets m
  CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories c ON c.market_id=m.id AND c.code=d.code
  CROSS JOIN (VALUES ('el-GR'),('en')) AS v(locale)
  ON CONFLICT (category_id,locale) DO UPDATE
  SET name=EXCLUDED.name,
      description=EXCLUDED.description,
      seo_title=EXCLUDED.seo_title,
      seo_description=EXCLUDED.seo_description;

  UPDATE public.category_product_types cpt
  SET is_default=false
  FROM public.markets m
  CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories c ON c.market_id=m.id AND c.code=d.code
  JOIN public.product_types target_pt ON target_pt.code=d.product_type_code AND target_pt.status='active'
  WHERE cpt.category_id=c.id AND cpt.product_type_id<>target_pt.id AND cpt.is_default=true;

  INSERT INTO public.category_product_types (category_id,product_type_id,is_default,sort_order,created_at)
  SELECT c.id,pt.id,true,10,now()
  FROM public.markets m
  CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories c ON c.market_id=m.id AND c.code=d.code
  JOIN public.product_types pt ON pt.code=d.product_type_code AND pt.status='active'
  ON CONFLICT (category_id,product_type_id) DO UPDATE
  SET is_default=true,sort_order=EXCLUDED.sort_order;

  SELECT count(*) INTO v_category_count
  FROM public.markets m CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories c ON c.market_id=m.id AND c.code=d.code AND c.active=true AND c.assignable=true AND c.taxonomy_role='product_class';

  SELECT count(*) INTO v_translation_count
  FROM public.markets m CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories c ON c.market_id=m.id AND c.code=d.code
  JOIN public.category_translations ct ON ct.category_id=c.id AND ct.locale IN ('el-GR','en');

  SELECT count(*) INTO v_type_link_count
  FROM public.markets m CROSS JOIN taxonomy_0127_definitions d
  JOIN public.categories c ON c.market_id=m.id AND c.code=d.code
  JOIN public.product_types pt ON pt.code=d.product_type_code
  JOIN public.category_product_types cpt ON cpt.category_id=c.id AND cpt.product_type_id=pt.id AND cpt.is_default=true;

  IF v_category_count <> v_definition_count*v_market_count
     OR v_translation_count <> v_definition_count*v_market_count*2
     OR v_type_link_count <> v_definition_count*v_market_count THEN
    RAISE EXCEPTION '0127 taxonomy final assertion failed: categories %, translations %, type links %', v_category_count,v_translation_count,v_type_link_count;
  END IF;

  RAISE NOTICE '0127 machinery/equipment taxonomy ready: % product classes across % market(s)', v_definition_count,v_market_count;
END
$$;

COMMIT;

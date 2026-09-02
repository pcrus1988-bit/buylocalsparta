-- KONTA MOU — residual reusable catalogue taxonomy expansion.
-- Adds coherent canonical product classes exposed by supplier evidence while leaving
-- mixed supplier buckets review-gated. Existing Product Types are reused deliberately.

BEGIN;

CREATE TEMP TABLE taxonomy_0203_definitions (
  code text PRIMARY KEY,
  parent_code text NOT NULL,
  product_type_code text NOT NULL,
  sort_order integer NOT NULL,
  name_el text NOT NULL,
  name_en text NOT NULL,
  description_el text NOT NULL,
  description_en text NOT NULL
) ON COMMIT DROP;

INSERT INTO taxonomy_0203_definitions (
  code, parent_code, product_type_code, sort_order,
  name_el, name_en, description_el, description_en
)
VALUES
  ('mailboxes-post-boxes','homeware-household-goods','homeware',90,
   'Γραμματοκιβώτια','Mailboxes & Post Boxes',
   'Γραμματοκιβώτια και κουτιά αλληλογραφίας για οικιακή και επαγγελματική χρήση.',
   'Mailboxes and post boxes for home and business use.'),
  ('small-home-furniture','furniture-kitchens','furniture',60,
   'Μικροέπιπλα','Small Home Furniture',
   'Μικρά βοηθητικά έπιπλα, παπουτσοθήκες, έπιπλα εισόδου και τρόλεϊ οργάνωσης.',
   'Compact furniture, shoe storage, entry furniture and mobile organisation trolleys.'),
  ('outboard-marine-engines','hunting-fishing-outdoor-goods','power_tool',80,
   'Εξωλέμβιες Μηχανές','Outboard Marine Engines',
   'Εξωλέμβιες μηχανές και κινητήρες πρόωσης για μικρά σκάφη και θαλάσσια χρήση.',
   'Outboard propulsion engines for small boats and marine use.'),
  ('livestock-farm-equipment','agricultural-supplies-machinery','business_equipment',80,
   'Κτηνοτροφικός Εξοπλισμός','Livestock & Farm Equipment',
   'Επαγγελματικός εξοπλισμός κτηνοτροφίας, επεξεργασίας ζωοτροφών και φροντίδας ζώων.',
   'Professional livestock, feed-processing and animal-care equipment.'),
  ('petrol-engines-motors','agricultural-supplies-machinery','power_tool',90,
   'Κινητήρες Βενζίνης','Petrol Engines & Motors',
   'Αυτόνομοι βενζινοκινητήρες γενικής χρήσης για μηχανήματα και εξοπλισμό.',
   'Standalone general-purpose petrol engines for machinery and equipment.'),
  ('poultry-processing-equipment','agricultural-supplies-machinery','business_equipment',100,
   'Εξοπλισμός Επεξεργασίας Πουλερικών','Poultry Processing Equipment',
   'Επαγγελματικός εξοπλισμός προετοιμασίας και επεξεργασίας πουλερικών.',
   'Professional poultry preparation and processing equipment.'),
  ('fuel-containers','agricultural-supplies-machinery','garden_supply',110,
   'Δοχεία Καυσίμου','Fuel Containers',
   'Φορητά δοχεία αποθήκευσης και μεταφοράς καυσίμου για μηχανήματα και εξοπλισμό.',
   'Portable fuel storage and transport containers for machinery and equipment.'),
  ('egg-incubators','agricultural-supplies-machinery','business_equipment',120,
   'Εκκολαπτικές Μηχανές','Egg Incubators',
   'Αυτόματες και επαγγελματικές εκκολαπτικές μηχανές για αυγά.',
   'Automatic and professional egg incubation equipment.'),
  ('cash-boxes','electrical-security-business-equipment','business_equipment',100,
   'Κουτιά Ταμείου','Cash Boxes',
   'Κλειδωμένα κουτιά ταμείου και ασφαλούς φύλαξης μετρητών για επαγγελματική χρήση.',
   'Lockable cash boxes and secure cash storage for business use.'),
  ('welding-workbenches','hardware-tools-paint','business_equipment',160,
   'Τραπέζια Συγκόλλησης','Welding Workbenches',
   'Τραπέζια και φορητοί πάγκοι εργασίας σχεδιασμένοι για συγκόλληση.',
   'Tables and portable workbenches designed for welding work.'),
  ('countertop-ovens','small-kitchen-appliances','small_appliance',70,
   'Επιτραπέζια Φουρνάκια','Countertop Ovens',
   'Μικροί επιτραπέζιοι φούρνοι και φουρνάκια κουζίνας.',
   'Compact countertop ovens and mini ovens for kitchen use.'),
  ('first-aid-cabinets-storage','medical-orthopaedic-hearing','homeware',90,
   'Φαρμακεία & Κουτιά Πρώτων Βοηθειών','First Aid Cabinets & Storage',
   'Κουτιά και ντουλάπια αποθήκευσης υλικών πρώτων βοηθειών.',
   'Cabinets and boxes for storing first-aid supplies.');

DO $$
DECLARE
  v_definition_count integer;
  v_market_count integer;
  v_resolved_count integer;
  v_category_count integer;
  v_translation_count integer;
  v_type_link_count integer;
BEGIN
  SELECT count(*) INTO v_definition_count FROM taxonomy_0203_definitions;
  IF v_definition_count <> 12 THEN
    RAISE EXCEPTION '0203 taxonomy definition assertion failed: expected 12 definitions, got %', v_definition_count;
  END IF;

  SELECT count(*) INTO v_market_count FROM public.markets;
  IF v_market_count = 0 THEN
    RAISE EXCEPTION '0203 taxonomy expansion requires at least one market';
  END IF;

  SELECT count(*) INTO v_resolved_count
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories parent
    ON parent.market_id=m.id
   AND parent.code=d.parent_code
   AND parent.active=true
  JOIN public.product_types pt
    ON pt.code=d.product_type_code
   AND pt.status='active';

  IF v_resolved_count <> v_definition_count * v_market_count THEN
    RAISE EXCEPTION '0203 taxonomy dependency assertion failed: expected % resolved market/definition pairs, got %',
      v_definition_count*v_market_count, v_resolved_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.markets m
    CROSS JOIN taxonomy_0203_definitions d
    JOIN public.categories c
      ON c.market_id=m.id
     AND lower(c.slug)=lower(d.code)
     AND c.code<>d.code
  ) THEN
    RAISE EXCEPTION '0203 taxonmy slug collision found for an existing category';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.markets m
    CROSS JOIN taxonomy_0203_definitions d
    JOIN public.categories c
      ON c.market_id=m.id
     AND c.code=d.code
     AND lower(c.slug)<>lower(d.code)
  ) THCN
    RAISE EXCEPTION '0203 taxonomy code collision found for an existing category';
  END IF;

  INSERT INTO public.categories (
    id, market_id, parent_id, code, slug, commerce_mode, active, filter_schema, sort_config,
    require_compatibility_confirmation, regulated_checkout_allowed, counteroffer_allowed, advice_allowed,
    checkout_fulfilment_modes, taxonomy_role, assignable, discoverable, sort_order, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), m.id, parent.id, d.code, d.code, 'standard', true, '{}'::jsonb, '{}'::jsonb,
    false, false, true, true, ARRAY['pickup','local_delivery','shipping']::text[],
    'product_class', true, true, d.sort_order, now(), now()
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories parent
    ON parent.market_id=m.id
   AND parent.code=d.parent_code
   AND parent.active=true
  ON CONFLICT (market_id,slug) DO UPDATE
  SET parent_id=EXCLUDED.parent_id,
      code=EXCLUDED.code,
      active=true,
      taxonomy_role='product_class',
      assignable=true,
      discoverable=true,
      sort_order=EXCLUDED.sort_order,
      updated_at=now();

  INSERT INTO public.category_translations (
    category_id, locale, name, description, seo_title, seo_description
  )
  SELECT
    c.id, v.locale,
    CASE v.locale WHEN 'el-GR' THEN d.name_el ELSE d.name_en END,
    CASE v.locale WHEN 'el-GR' THEN d.description_el ELSE d.description_en END,
    CASE v.locale WHEN 'el-GR' THEN d.name_el ELSE d.name_en END,
    CASE v.locale WHEN 'el-GR' THEN d.description_el ELSE d.description_en END
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories c
    ON c.market_id=m.id
   AND c.code=d.code
  CROSS JOIN (VALUES ('el-GR'),('en')) AS v(locale)
  ON CONFLICT (category_id,locale) DO UPDATE
  SET name=EXCLUDED.name,
      description=EXCLUDED.description,
      seo_title=EXCLUDED.seo_title,
      seo_description=EXCLUDED.seo_description;

  UPDATE public.category_product_types cpt
  SET is_default=false
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories c
    ON c.market_id=m.id
   AND c.code=d.code
  JOIN public.product_types target_pt
    ON target_pt.code=d.product_type_code
   AND target_pt.status='active'
  WHERE cpt.category_id=c.id
    AND cpt.product_type_id<>target_pt.id
    AND cpt.is_default=true;

  INSERT INTO public.category_product_types (
    category_id, product_type_id, is_default, sort_order, created_at
  )
  SELECT c.id, pt.id, true, 10, now()
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories c
    ON c.market_id=m.id
   AND c.code=d.code
  JOIN public.product_types pt
    ON pt.code=d.product_type_code
   AND pt.status='active'
  ON CONFLICT (category_id,product_type_id) DO UPDATE
  SET is_default=true,
      sort_order=EXCLUDED.sort_order;

  SELECT count(*) INTO v_category_count
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories c
    ON c.market_id=m.id
   AND c.code=d.code
   AND c.active=true
   AND c.assignable=true
   AND c.taxonomy_role='product_class';

  SELECT count(*) INTO v_translation_count
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories c
    ON c.market_id=m.id
   AND c.code=d.code
  JOIN public.category_translations ct
    ON ct.category_id=c.id
   AND ct.locale IN ('el-GR','en');

  SELECT count(*) INTO v_type_link_count
  FROM public.markets m
  CROSS JOIN taxonomy_0203_definitions d
  JOIN public.categories c
    ON c.market_id=m.id
   AND c.code=d.code
  JOIN public.product_types pt
    ON pt.code=d.product_type_code
  JOIN public.category_product_types cpt
    ON cpt.category_id=c.id
   AND cpt.product_type_id=pt.id
   AND cpt.is_default=true;

  IF v_category_count <> v_definition_count*v_market_count
     OR v_translation_count <> v_definition_count*v_market_count*2
     OR v_type_link_count <> v_definition_count*v_market_count THEN
    RAISE EXCEPTION '0203 taxonomy final assertion failed: categories %, translations %, type links %',
      v_category_count, v_translation_count, v_type_link_count;
  END IF;
END;
$$;

COMMIT;

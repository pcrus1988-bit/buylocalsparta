-- Buy Local Sparta — customer taxonomy: technology and appliances
-- Existing IDs remain unchanged; only new descendants and semantic parent updates are added.

BEGIN;

CREATE TEMP TABLE _taxonomy_seed (
  code text PRIMARY KEY,
  parent_code text NOT NULL,
  name_el text NOT NULL,
  name_en text NOT NULL,
  taxonomy_role text NOT NULL,
  assignable boolean NOT NULL,
  sort_order integer NOT NULL,
  commerce_mode text,
  require_compatibility_confirmation boolean,
  regulated_checkout_allowed boolean,
  counteroffer_allowed boolean,
  advice_allowed boolean,
  checkout_fulfilment_modes text[]
) ON COMMIT DROP;

INSERT INTO _taxonomy_seed
(code,parent_code,name_el,name_en,taxonomy_role,assignable,sort_order,commerce_mode,
 require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,
 advice_allowed,checkout_fulfilment_modes)
VALUES
  ('mobile-phones', 'mobile-telecom-electronics', 'Κινητά τηλέφωνα', 'Mobile phones', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('smartphones', 'mobile-phones', 'Smartphones', 'Smartphones', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('feature-phones', 'mobile-phones', 'Απλά κινητά τηλέφωνα', 'Feature phones', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mobile-accessories', 'mobile-telecom-electronics', 'Αξεσουάρ κινητών', 'Mobile accessories', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('phone-cases-protection', 'mobile-accessories', 'Θήκες & προστασία κινητών', 'Phone cases & protection', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('screen-protectors', 'mobile-accessories', 'Προστατευτικά οθόνης', 'Screen protectors', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('chargers-cables', 'mobile-accessories', 'Φορτιστές & καλώδια', 'Chargers & cables', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('power-banks', 'mobile-accessories', 'Power banks', 'Power banks', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('phone-mounts-holders', 'mobile-accessories', 'Βάσεις & στηρίγματα κινητών', 'Phone mounts & holders', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('headphones-headsets', 'mobile-telecom-electronics', 'Ακουστικά & headsets', 'Headphones & headsets', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('wearables-smartwatches', 'mobile-telecom-electronics', 'Wearables & smartwatches', 'Wearables & smartwatches', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('tablets-ereaders', 'mobile-telecom-electronics', 'Tablets & e-readers', 'Tablets & e-readers', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('laptops', 'computers-peripherals', 'Φορητοί υπολογιστές', 'Laptops', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('desktop-computers', 'computers-peripherals', 'Σταθεροί υπολογιστές', 'Desktop computers', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('monitors', 'computers-peripherals', 'Οθόνες υπολογιστών', 'Monitors', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('keyboards-mice', 'computers-peripherals', 'Πληκτρολόγια & ποντίκια', 'Keyboards & mice', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('computer-storage', 'computers-peripherals', 'Αποθηκευτικά μέσα', 'Computer storage', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('networking-equipment', 'computers-peripherals', 'Δικτυακός εξοπλισμός', 'Networking equipment', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('printers-scanners', 'computers-peripherals', 'Εκτυπωτές & σαρωτές', 'Printers & scanners', 'product_class', true, 70, NULL, NULL, NULL, NULL, NULL, NULL),
  ('printer-consumables', 'computers-peripherals', 'Μελάνια, toner & αναλώσιμα εκτυπωτών', 'Printer ink, toner & consumables', 'product_class', true, 80, NULL, NULL, NULL, NULL, NULL, NULL),
  ('computer-components', 'computers-peripherals', 'Εξαρτήματα υπολογιστών', 'Computer components', 'product_class', true, 90, NULL, NULL, NULL, NULL, NULL, NULL),
  ('computer-accessories', 'computers-peripherals', 'Αξεσουάρ υπολογιστών', 'Computer accessories', 'product_class', true, 100, NULL, NULL, NULL, NULL, NULL, NULL),
  ('tv-audio-home-entertainment', 'technology-appliances', 'Τηλεοράσεις, ήχος & home entertainment', 'TV, audio & home entertainment', 'navigation_group', false, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('televisions', 'tv-audio-home-entertainment', 'Τηλεοράσεις', 'Televisions', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('soundbars-speakers', 'tv-audio-home-entertainment', 'Soundbars & ηχεία', 'Soundbars & speakers', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('streaming-media-players', 'tv-audio-home-entertainment', 'Streaming & media players', 'Streaming & media players', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('cameras-photography', 'technology-appliances', 'Κάμερες & φωτογραφία', 'Cameras & photography', 'navigation_group', false, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('digital-cameras', 'cameras-photography', 'Ψηφιακές φωτογραφικές μηχανές', 'Digital cameras', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('camera-lenses', 'cameras-photography', 'Φακοί φωτογραφικών μηχανών', 'Camera lenses', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('camera-accessories', 'cameras-photography', 'Αξεσουάρ φωτογραφίας', 'Camera accessories', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('large-appliances', 'electrical-appliances', 'Μεγάλες οικιακές συσκευές', 'Large appliances', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('refrigerators-freezers', 'large-appliances', 'Ψυγεία & καταψύκτες', 'Refrigerators & freezers', 'product_class', true, 10, 'logistics_sensitive', NULL, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('washing-drying-appliances', 'large-appliances', 'Πλυντήρια & στεγνωτήρια', 'Washing & drying appliances', 'product_class', true, 20, 'logistics_sensitive', NULL, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('dishwashers', 'large-appliances', 'Πλυντήρια πιάτων', 'Dishwashers', 'product_class', true, 30, 'logistics_sensitive', NULL, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('ovens-hobs', 'large-appliances', 'Φούρνοι & εστίες', 'Ovens & hobs', 'product_class', true, 40, 'logistics_sensitive', NULL, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('small-kitchen-appliances', 'electrical-appliances', 'Μικροσυσκευές κουζίνας', 'Small kitchen appliances', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('coffee-beverage-appliances', 'small-kitchen-appliances', 'Καφετιέρες & συσκευές ροφημάτων', 'Coffee & beverage appliances', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('food-preparation-appliances', 'small-kitchen-appliances', 'Συσκευές προετοιμασίας τροφίμων', 'Food preparation appliances', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kettles-toasters', 'small-kitchen-appliances', 'Βραστήρες & φρυγανιέρες', 'Kettles & toasters', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('vacuum-cleaners', 'electrical-appliances', 'Ηλεκτρικές σκούπες', 'Vacuum cleaners', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('irons-garment-care', 'electrical-appliances', 'Σίδερα & περιποίηση ρούχων', 'Irons & garment care', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('personal-care-appliances', 'electrical-appliances', 'Ηλεκτρικές συσκευές προσωπικής φροντίδας', 'Personal care appliances', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('security-surveillance', 'electrical-security-business-equipment', 'Κάμερες ασφαλείας & επιτήρηση', 'Security cameras & surveillance', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('alarms-access-control', 'electrical-security-business-equipment', 'Συναγερμοί & έλεγχος πρόσβασης', 'Alarms & access control', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('electrical-installation-supplies', 'electrical-security-business-equipment', 'Ηλεκτρολογικό υλικό', 'Electrical installation supplies', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('business-office-machines', 'electrical-security-business-equipment', 'Επαγγελματικές & γραφειακές μηχανές', 'Business & office machines', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('pos-barcode-equipment', 'electrical-security-business-equipment', 'POS & εξοπλισμός barcode', 'POS & barcode equipment', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL);

DO $$
DECLARE
  inserted_count integer;
  unresolved_count integer;
BEGIN
  LOOP
    INSERT INTO categories (
      market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
      require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,
      advice_allowed,checkout_fulfilment_modes,taxonomy_role,assignable,discoverable,sort_order
    )
    SELECT
      p.market_id,p.id,s.code,s.code,
      COALESCE(s.commerce_mode,p.commerce_mode),true,'{}'::jsonb,'{}'::jsonb,
      COALESCE(s.require_compatibility_confirmation,p.require_compatibility_confirmation),
      COALESCE(s.regulated_checkout_allowed,p.regulated_checkout_allowed),
      COALESCE(s.counteroffer_allowed,p.counteroffer_allowed),
      COALESCE(s.advice_allowed,p.advice_allowed),
      COALESCE(s.checkout_fulfilment_modes,p.checkout_fulfilment_modes),
      s.taxonomy_role,s.assignable,true,s.sort_order
    FROM _taxonomy_seed s
    JOIN categories p ON p.code=s.parent_code
    WHERE NOT EXISTS (
      SELECT 1 FROM categories existing
      WHERE existing.market_id IS NOT DISTINCT FROM p.market_id
        AND existing.code=s.code
    )
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    SELECT count(*) INTO unresolved_count
    FROM _taxonomy_seed s
    WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.code=s.code);

    EXIT WHEN unresolved_count=0;
    IF inserted_count=0 THEN
      RAISE EXCEPTION 'taxonomy seed has % unresolved nodes (missing/cyclic parents)', unresolved_count;
    END IF;
  END LOOP;
END;
$$;

INSERT INTO category_translations(category_id,locale,name)
SELECT c.id,'el',s.name_el
FROM categories c JOIN _taxonomy_seed s ON s.code=c.code
ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO category_translations(category_id,locale,name)
SELECT c.id,'en',s.name_en
FROM categories c JOIN _taxonomy_seed s ON s.code=c.code
ON CONFLICT (category_id,locale) DO UPDATE SET name=EXCLUDED.name;

UPDATE categories c
SET taxonomy_role='navigation_group', assignable=false, updated_at=now()
WHERE c.code IN ('computers-peripherals','mobile-telecom-electronics','electrical-appliances','electrical-security-business-equipment')
AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id=c.id)
AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id=c.id);

COMMIT;

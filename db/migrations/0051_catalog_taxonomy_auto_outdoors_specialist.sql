-- Buy Local Sparta — customer taxonomy: automotive, agriculture, pets, outdoors and specialist retail
-- Existing IDs remain unchanged; restricted legacy branches are not expanded here.

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
  ('car-parts', 'automotive-parts-accessories', 'Ανταλλακτικά αυτοκινήτου', 'Car parts', 'product_class', true, 10, 'compatibility_sensitive', true, NULL, NULL, NULL, NULL),
  ('motorcycle-parts', 'automotive-parts-accessories', 'Ανταλλακτικά μοτοσυκλέτας', 'Motorcycle parts', 'product_class', true, 20, 'compatibility_sensitive', true, NULL, NULL, NULL, NULL),
  ('vehicle-batteries', 'automotive-parts-accessories', 'Μπαταρίες οχημάτων', 'Vehicle batteries', 'product_class', true, 30, 'compatibility_sensitive', true, NULL, NULL, NULL, NULL),
  ('tyres-wheels', 'automotive-parts-accessories', 'Ελαστικά & ζάντες', 'Tyres & wheels', 'product_class', true, 40, 'compatibility_sensitive', true, NULL, NULL, NULL, NULL),
  ('motor-oils-fluids', 'automotive-parts-accessories', 'Λιπαντικά & υγρά οχημάτων', 'Motor oils & fluids', 'product_class', true, 50, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('car-care', 'automotive-parts-accessories', 'Περιποίηση αυτοκινήτου', 'Car care', 'product_class', true, 60, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('automotive-accessories', 'automotive-parts-accessories', 'Αξεσουάρ αυτοκινήτου', 'Automotive accessories', 'product_class', true, 70, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('in-car-electronics', 'automotive-parts-accessories', 'Ηλεκτρονικά αυτοκινήτου', 'In-car electronics', 'product_class', true, 80, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('vehicle-emergency-tools', 'automotive-parts-accessories', 'Εργαλεία & εξοπλισμός έκτακτης ανάγκης', 'Vehicle emergency tools', 'product_class', true, 90, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('motor-vehicles', 'vehicles-motorcycles-bicycles', 'Αυτοκίνητα & λοιπά οχήματα', 'Cars & motor vehicles', 'product_class', true, 10, 'vehicles', true, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('motorcycles-scooters', 'vehicles-motorcycles-bicycles', 'Μοτοσυκλέτες & scooters', 'Motorcycles & scooters', 'product_class', true, 20, 'vehicles', true, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('bicycles-cycling', 'automotive-mobility', 'Ποδήλατα & ποδηλασία', 'Bicycles & cycling', 'navigation_group', false, 30, 'logistics_sensitive', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('bicycles', 'bicycles-cycling', 'Ποδήλατα', 'Bicycles', 'product_class', true, 10, 'logistics_sensitive', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery']::text[]),
  ('bicycle-parts', 'bicycles-cycling', 'Ανταλλακτικά ποδηλάτου', 'Bicycle parts', 'product_class', true, 20, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('cycling-accessories', 'bicycles-cycling', 'Αξεσουάρ ποδηλάτου', 'Cycling accessories', 'product_class', true, 30, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('cycling-helmets-protection', 'bicycles-cycling', 'Κράνη & προστασία ποδηλάτου', 'Cycling helmets & protection', 'product_class', true, 40, 'standard', false, NULL, NULL, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('dog-accessories', 'pet-animal-supplies', 'Αξεσουάρ σκύλου', 'Dog accessories', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('cat-accessories', 'pet-animal-supplies', 'Αξεσουάρ γάτας', 'Cat accessories', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('pet-beds-carriers', 'pet-animal-supplies', 'Κρεβάτια & μεταφορά κατοικιδίων', 'Pet beds & carriers', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('pet-grooming-hygiene', 'pet-animal-supplies', 'Περιποίηση & υγιεινή κατοικιδίων', 'Pet grooming & hygiene', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('aquatics-supplies', 'pet-animal-supplies', 'Είδη ενυδρείου', 'Aquatics supplies', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('pet-feeders-bowls', 'pet-animal-supplies', 'Ταΐστρες & μπολ', 'Pet feeders & bowls', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('agricultural-hand-tools', 'agriculture-pets-outdoors', 'Γεωργικά εργαλεία χειρός', 'Agricultural hand tools', 'product_class', true, 10, 'standard', NULL, NULL, true, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('irrigation-watering', 'agriculture-pets-outdoors', 'Άρδευση & πότισμα', 'Irrigation & watering', 'product_class', true, 20, 'standard', NULL, NULL, true, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('greenhouse-growing-supplies', 'agriculture-pets-outdoors', 'Θερμοκήπιο & καλλιεργητικά είδη', 'Greenhouse & growing supplies', 'product_class', true, 30, 'standard', NULL, NULL, true, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('camping-outdoor-equipment', 'agriculture-pets-outdoors', 'Camping & εξοπλισμός υπαίθρου', 'Camping & outdoor equipment', 'product_class', true, 40, 'standard', NULL, NULL, true, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('fishing-equipment', 'agriculture-pets-outdoors', 'Εξοπλισμός αλιείας', 'Fishing equipment', 'product_class', true, 50, 'standard', NULL, NULL, true, NULL, ARRAY['pickup','local_delivery','shipping']::text[]),
  ('agricultural-machinery-accessories', 'agricultural-supplies-machinery', 'Αξεσουάρ γεωργικών μηχανημάτων', 'Agricultural machinery accessories', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('regulated-agricultural-supplies', 'agricultural-supplies-machinery', 'Ρυθμιζόμενα γεωργικά εφόδια', 'Regulated agricultural supplies', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('beehives-components', 'beekeeping-supplies', 'Κυψέλες & εξαρτήματα', 'Beehives & components', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('beekeeping-protective-clothing', 'beekeeping-supplies', 'Προστατευτική ένδυση μελισσοκομίας', 'Beekeeping protective clothing', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('beekeeping-tools-accessories', 'beekeeping-supplies', 'Εργαλεία & αξεσουάρ μελισσοκομίας', 'Beekeeping tools & accessories', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('retail-packaging', 'packaging-shop-office-equipment', 'Συσκευασία λιανικής', 'Retail packaging', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('shipping-packaging', 'packaging-shop-office-equipment', 'Συσκευασία αποστολών', 'Shipping packaging', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('labels-tags', 'packaging-shop-office-equipment', 'Ετικέτες & καρτελάκια', 'Labels & tags', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('shop-display-merchandising', 'packaging-shop-office-equipment', 'Προβολή & εξοπλισμός καταστήματος', 'Shop display & merchandising', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('business-consumables', 'packaging-shop-office-equipment', 'Επαγγελματικά αναλώσιμα', 'Business consumables', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('wedding-accessories', 'religious-ceremonial-goods', 'Είδη & αξεσουάρ γάμου', 'Wedding accessories', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('baptism-goods', 'religious-ceremonial-goods', 'Είδη βάπτισης', 'Baptism goods', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('religious-items', 'religious-ceremonial-goods', 'Θρησκευτικά είδη', 'Religious items', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ceremonial-decor', 'religious-ceremonial-goods', 'Διακόσμηση τελετών', 'Ceremonial décor', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL);

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
WHERE c.code IN ('automotive-parts-accessories','vehicles-motorcycles-bicycles','pet-animal-supplies','beekeeping-supplies','packaging-shop-office-equipment','religious-ceremonial-goods')
AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id=c.id)
AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id=c.id);

COMMIT;

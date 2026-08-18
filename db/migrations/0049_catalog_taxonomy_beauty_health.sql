-- Buy Local Sparta — customer taxonomy: beauty, cosmetics and medical retail
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
  ('skincare', 'cosmetics-perfumery', 'Περιποίηση προσώπου', 'Skincare', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('makeup', 'cosmetics-perfumery', 'Μακιγιάζ', 'Makeup', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fragrance', 'cosmetics-perfumery', 'Αρώματα', 'Fragrance', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('haircare', 'cosmetics-perfumery', 'Περιποίηση μαλλιών', 'Haircare', 'navigation_group', false, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('bath-body-care', 'cosmetics-perfumery', 'Περιποίηση σώματος & μπάνιου', 'Bath & body care', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('grooming-care', 'cosmetics-perfumery', 'Περιποίηση & grooming', 'Grooming', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('beauty-tools-accessories', 'cosmetics-perfumery', 'Εργαλεία & αξεσουάρ ομορφιάς', 'Beauty tools & accessories', 'product_class', true, 70, NULL, NULL, NULL, NULL, NULL, NULL),
  ('facial-cleansers', 'skincare', 'Καθαρισμός προσώπου', 'Facial cleansers', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('face-moisturisers', 'skincare', 'Ενυδάτωση προσώπου', 'Face moisturisers', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('serums-treatments', 'skincare', 'Serums & θεραπείες προσώπου', 'Serums & treatments', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('sun-care', 'skincare', 'Αντηλιακή προστασία', 'Sun care', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('face-makeup', 'makeup', 'Μακιγιάζ προσώπου', 'Face makeup', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('eye-makeup', 'makeup', 'Μακιγιάζ ματιών', 'Eye makeup', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('lip-makeup', 'makeup', 'Μακιγιάζ χειλιών', 'Lip makeup', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('nail-care-colour', 'makeup', 'Νύχια & βερνίκια', 'Nail care & colour', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('shampoo-conditioner', 'haircare', 'Σαμπουάν & conditioner', 'Shampoo & conditioner', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hair-treatments', 'haircare', 'Θεραπείες μαλλιών', 'Hair treatments', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hair-styling-products', 'haircare', 'Προϊόντα styling μαλλιών', 'Hair styling products', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('supports-braces', 'medical-orthopaedic-hearing', 'Νάρθηκες & υποστηρίγματα', 'Supports & braces', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mobility-aids', 'medical-orthopaedic-hearing', 'Βοηθήματα κινητικότητας', 'Mobility aids', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('home-health-devices', 'medical-orthopaedic-hearing', 'Συσκευές υγείας για το σπίτι', 'Home health devices', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hearing-accessories', 'medical-orthopaedic-hearing', 'Αξεσουάρ ακοής', 'Hearing accessories', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('medical-consumables', 'medical-orthopaedic-hearing', 'Ιατρικά αναλώσιμα', 'Medical consumables', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL);

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
WHERE c.code IN ('cosmetics-perfumery','medical-orthopaedic-hearing')
AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id=c.id)
AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id=c.id);

COMMIT;

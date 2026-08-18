-- Buy Local Sparta — customer taxonomy: home, furniture, garden, DIY and building
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
  ('living-room-furniture', 'furniture-kitchens', 'Έπιπλα σαλονιού', 'Living room furniture', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('dining-room-furniture', 'furniture-kitchens', 'Έπιπλα τραπεζαρίας', 'Dining room furniture', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('bedroom-furniture', 'furniture-kitchens', 'Έπιπλα υπνοδωματίου', 'Bedroom furniture', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('office-furniture', 'furniture-kitchens', 'Έπιπλα γραφείου', 'Office furniture', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('children-furniture', 'furniture-kitchens', 'Παιδικά έπιπλα', 'Children’s furniture', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kitchen-furniture', 'furniture-kitchens', 'Έπιπλα κουζίνας', 'Kitchen furniture', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('outdoor-furniture', 'furniture-kitchens', 'Έπιπλα εξωτερικού χώρου', 'Outdoor furniture', 'product_class', true, 70, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mattresses', 'beds-mattresses', 'Στρώματα', 'Mattresses', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('bed-frames', 'beds-mattresses', 'Κρεβάτια & βάσεις', 'Beds & bed frames', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mattress-bed-accessories', 'beds-mattresses', 'Αξεσουάρ στρώματος & κρεβατιού', 'Mattress & bed accessories', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('lighting', 'lighting-decor', 'Φωτισμός', 'Lighting', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ceiling-lighting', 'lighting', 'Φωτιστικά οροφής', 'Ceiling lighting', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('wall-lighting', 'lighting', 'Φωτιστικά τοίχου', 'Wall lighting', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('table-floor-lamps', 'lighting', 'Επιτραπέζια & επιδαπέδια φωτιστικά', 'Table & floor lamps', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('outdoor-lighting', 'lighting', 'Φωτισμός εξωτερικού χώρου', 'Outdoor lighting', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('light-bulbs-accessories', 'lighting', 'Λαμπτήρες & αξεσουάρ φωτισμού', 'Light bulbs & accessories', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('home-decor', 'lighting-decor', 'Διακόσμηση σπιτιού', 'Home décor', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mirrors', 'home-decor', 'Καθρέφτες', 'Mirrors', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('wall-decor', 'home-decor', 'Διακόσμηση τοίχου', 'Wall décor', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('decorative-objects', 'home-decor', 'Διακοσμητικά αντικείμενα', 'Decorative objects', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('candles-home-fragrance', 'home-decor', 'Κεριά & αρωματικά χώρου', 'Candles & home fragrance', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kitchen-dining-homeware', 'homeware-household-goods', 'Κουζίνα & τραπεζαρία', 'Kitchen & dining homeware', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('cookware-bakeware', 'homeware-household-goods', 'Μαγειρικά σκεύη & είδη ψησίματος', 'Cookware & bakeware', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('tableware-glassware', 'homeware-household-goods', 'Σερβίτσια & ποτήρια', 'Tableware & glassware', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('storage-organisation', 'homeware-household-goods', 'Αποθήκευση & οργάνωση', 'Storage & organisation', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('cleaning-household-accessories', 'homeware-household-goods', 'Είδη καθαρισμού & οικιακά αξεσουάρ', 'Cleaning & household accessories', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('bathroom-accessories', 'homeware-household-goods', 'Αξεσουάρ μπάνιου', 'Bathroom accessories', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('bedding-linen', 'textiles-linen-curtains-carpets', 'Κλινοσκεπάσματα & λευκά είδη', 'Bedding & linen', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('towels-bath-textiles', 'textiles-linen-curtains-carpets', 'Πετσέτες & υφάσματα μπάνιου', 'Towels & bath textiles', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('cushions-throws', 'textiles-linen-curtains-carpets', 'Μαξιλάρια & ριχτάρια', 'Cushions & throws', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('curtains-blinds', 'textiles-linen-curtains-carpets', 'Κουρτίνες & στόρια', 'Curtains & blinds', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('rugs-carpets', 'textiles-linen-curtains-carpets', 'Χαλιά & μοκέτες', 'Rugs & carpets', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('indoor-plants', 'flowers-plants-garden', 'Φυτά εσωτερικού χώρου', 'Indoor plants', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('outdoor-plants', 'flowers-plants-garden', 'Φυτά εξωτερικού χώρου', 'Outdoor plants', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('planters-pots', 'flowers-plants-garden', 'Γλάστρες & κασπώ', 'Planters & pots', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('garden-outdoor-accessories', 'flowers-plants-garden', 'Αξεσουάρ κήπου & εξωτερικού χώρου', 'Garden & outdoor accessories', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('air-conditioning', 'heating-cooling-fireplaces', 'Κλιματιστικά', 'Air conditioning', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('heaters', 'heating-cooling-fireplaces', 'Θερμαντικά σώματα & θερμάστρες', 'Heaters', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fans-air-circulation', 'heating-cooling-fireplaces', 'Ανεμιστήρες & κυκλοφορία αέρα', 'Fans & air circulation', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fireplaces-stoves', 'heating-cooling-fireplaces', 'Τζάκια & σόμπες', 'Fireplaces & stoves', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('heating-cooling-accessories', 'heating-cooling-fireplaces', 'Αξεσουάρ θέρμανσης & ψύξης', 'Heating & cooling accessories', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hand-tools', 'hardware-tools-paint', 'Εργαλεία χειρός', 'Hand tools', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('power-tools', 'hardware-tools-paint', 'Ηλεκτρικά εργαλεία', 'Power tools', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('tool-accessories-consumables', 'hardware-tools-paint', 'Εξαρτήματα & αναλώσιμα εργαλείων', 'Tool accessories & consumables', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hardware-fasteners', 'hardware-tools-paint', 'Σιδηρικά & στερεωτικά', 'Hardware & fasteners', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('paint-decorating', 'hardware-tools-paint', 'Χρώματα & είδη βαφής', 'Paint & decorating', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('safety-ppe', 'hardware-tools-paint', 'Μέσα ατομικής προστασίας', 'Safety & PPE', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('cement-masonry-materials', 'building-materials-timber', 'Τσιμέντο & υλικά τοιχοποιίας', 'Cement & masonry materials', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('insulation-materials', 'building-materials-timber', 'Μονωτικά υλικά', 'Insulation materials', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('timber-boards', 'building-materials-timber', 'Ξυλεία & πλάκες', 'Timber & boards', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('roofing-materials', 'building-materials-timber', 'Υλικά στέγης', 'Roofing materials', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('flooring-tiles', 'building-materials-timber', 'Δάπεδα & πλακίδια', 'Flooring & tiles', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('doors', 'doors-windows-aluminium-railings', 'Πόρτες', 'Doors', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('windows', 'doors-windows-aluminium-railings', 'Παράθυρα', 'Windows', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('railings-balustrades', 'doors-windows-aluminium-railings', 'Κιγκλιδώματα', 'Railings & balustrades', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('door-window-hardware', 'doors-windows-aluminium-railings', 'Εξαρτήματα θυρών & παραθύρων', 'Door & window hardware', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('sanitaryware', 'sanitary-plumbing-glazing', 'Είδη υγιεινής', 'Sanitaryware', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('plumbing-pipes-fittings', 'sanitary-plumbing-glazing', 'Σωλήνες & εξαρτήματα υδραυλικών', 'Plumbing pipes & fittings', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('faucets-showers', 'sanitary-plumbing-glazing', 'Μπαταρίες & ντους', 'Faucets & showers', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('sinks-basins', 'sanitary-plumbing-glazing', 'Νεροχύτες & νιπτήρες', 'Sinks & basins', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('glazing-glass', 'sanitary-plumbing-glazing', 'Υαλοπίνακες & γυαλί', 'Glazing & glass', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL);

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
WHERE c.code IN ('furniture-kitchens','beds-mattresses','lighting-decor','homeware-household-goods','textiles-linen-curtains-carpets','flowers-plants-garden','heating-cooling-fireplaces','hardware-tools-paint','building-materials-timber','doors-windows-aluminium-railings','sanitary-plumbing-glazing')
AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id=c.id)
AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id=c.id);

COMMIT;

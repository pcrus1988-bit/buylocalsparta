-- Buy Local Sparta — customer taxonomy: fashion, footwear and accessories
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
  ('womens-clothing', 'adult-clothing', 'Γυναικεία ρούχα', 'Women’s clothing', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-clothing', 'adult-clothing', 'Ανδρικά ρούχα', 'Men’s clothing', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-dresses', 'womens-clothing', 'Γυναικεία φορέματα', 'Women’s dresses', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-shirts', 'womens-clothing', 'Γυναικεία πουκάμισα', 'Women’s shirts', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-tops', 'womens-clothing', 'Γυναικεία τοπ', 'Women’s tops', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-knitwear', 'womens-clothing', 'Γυναικεία πλεκτά', 'Women’s knitwear', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-trousers-jeans', 'womens-clothing', 'Γυναικεία παντελόνια & jeans', 'Women’s trousers & jeans', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-skirts', 'womens-clothing', 'Γυναικείες φούστες', 'Women’s skirts', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-jackets-coats', 'womens-clothing', 'Γυναικεία μπουφάν & παλτό', 'Women’s jackets & coats', 'product_class', true, 70, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-sets', 'womens-clothing', 'Γυναικεία σετ', 'Women’s sets', 'product_class', true, 80, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-activewear', 'womens-clothing', 'Γυναικεία αθλητικά ρούχα', 'Women’s activewear', 'product_class', true, 90, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-womens-swimwear', 'womens-clothing', 'Γυναικεία μαγιό', 'Women’s swimwear', 'product_class', true, 100, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-tshirts-tops', 'mens-clothing', 'Ανδρικά T-shirts & τοπ', 'Men’s T-shirts & tops', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-shirts', 'mens-clothing', 'Ανδρικά πουκάμισα', 'Men’s shirts', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-knitwear', 'mens-clothing', 'Ανδρικά πλεκτά', 'Men’s knitwear', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-trousers-jeans', 'mens-clothing', 'Ανδρικά παντελόνια & jeans', 'Men’s trousers & jeans', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-jackets-coats', 'mens-clothing', 'Ανδρικά μπουφάν & παλτό', 'Men’s jackets & coats', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-suits-formal', 'mens-clothing', 'Ανδρικά κοστούμια & επίσημα', 'Men’s suits & formalwear', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-activewear', 'mens-clothing', 'Ανδρικά αθλητικά ρούχα', 'Men’s activewear', 'product_class', true, 70, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fashion-mens-swimwear', 'mens-clothing', 'Ανδρικά μαγιό', 'Men’s swimwear', 'product_class', true, 80, NULL, NULL, NULL, NULL, NULL, NULL),
  ('baby-clothing', 'children-baby-clothing', 'Βρεφικά ρούχα', 'Baby clothing', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('girls-clothing', 'children-baby-clothing', 'Κοριτσίστικα ρούχα', 'Girls’ clothing', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('boys-clothing', 'children-baby-clothing', 'Αγορίστικα ρούχα', 'Boys’ clothing', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('womens-footwear', 'footwear', 'Γυναικεία υποδήματα', 'Women’s footwear', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-footwear', 'footwear', 'Ανδρικά υποδήματα', 'Men’s footwear', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kids-footwear', 'footwear', 'Παιδικά υποδήματα', 'Kids’ footwear', 'navigation_group', false, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('womens-sneakers', 'womens-footwear', 'Γυναικεία sneakers', 'Women’s sneakers', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('womens-running-shoes', 'womens-footwear', 'Γυναικεία παπούτσια τρεξίματος', 'Women’s running shoes', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('womens-boots', 'womens-footwear', 'Γυναικεία μπότες & μποτάκια', 'Women’s boots', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('womens-sandals', 'womens-footwear', 'Γυναικεία σανδάλια', 'Women’s sandals', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('womens-formal-shoes', 'womens-footwear', 'Γυναικεία επίσημα παπούτσια', 'Women’s formal shoes', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-sneakers', 'mens-footwear', 'Ανδρικά sneakers', 'Men’s sneakers', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-running-shoes', 'mens-footwear', 'Ανδρικά παπούτσια τρεξίματος', 'Men’s running shoes', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-boots', 'mens-footwear', 'Ανδρικά μπότες & μποτάκια', 'Men’s boots', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-sandals', 'mens-footwear', 'Ανδρικά σανδάλια', 'Men’s sandals', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-formal-shoes', 'mens-footwear', 'Ανδρικά επίσημα παπούτσια', 'Men’s formal shoes', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kids-sneakers', 'kids-footwear', 'Παιδικά sneakers', 'Kids’ sneakers', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kids-running-shoes', 'kids-footwear', 'Παιδικά παπούτσια τρεξίματος', 'Kids’ running shoes', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kids-boots', 'kids-footwear', 'Παιδικά μπότες & μποτάκια', 'Kids’ boots', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kids-sandals', 'kids-footwear', 'Παιδικά σανδάλια', 'Kids’ sandals', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('kids-formal-shoes', 'kids-footwear', 'Παιδικά επίσημα παπούτσια', 'Kids’ formal shoes', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('handbags', 'bags-accessories-leather', 'Γυναικείες τσάντες', 'Handbags', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('backpacks', 'bags-accessories-leather', 'Σακίδια', 'Backpacks', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('wallets-cardholders', 'bags-accessories-leather', 'Πορτοφόλια & θήκες καρτών', 'Wallets & cardholders', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('luggage-travel-bags', 'bags-accessories-leather', 'Αποσκευές & ταξιδιωτικές τσάντες', 'Luggage & travel bags', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('belts', 'bags-accessories-leather', 'Ζώνες', 'Belts', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('scarves-hats-gloves', 'bags-accessories-leather', 'Κασκόλ, καπέλα & γάντια', 'Scarves, hats & gloves', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('rings', 'jewellery-watches', 'Δαχτυλίδια', 'Rings', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('necklaces', 'jewellery-watches', 'Κολιέ', 'Necklaces', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('bracelets', 'jewellery-watches', 'Βραχιόλια', 'Bracelets', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('earrings', 'jewellery-watches', 'Σκουλαρίκια', 'Earrings', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('watches', 'jewellery-watches', 'Ρολόγια', 'Watches', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('sunglasses', 'optical-retail', 'Γυαλιά ηλίου', 'Sunglasses', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('optical-frames', 'optical-retail', 'Σκελετοί οράσεως', 'Optical frames', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('optical-accessories', 'optical-retail', 'Αξεσουάρ οπτικών', 'Optical accessories', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('womens-underwear', 'underwear-hosiery', 'Γυναικεία εσώρουχα', 'Women’s underwear', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mens-underwear', 'underwear-hosiery', 'Ανδρικά εσώρουχα', 'Men’s underwear', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('socks-hosiery', 'underwear-hosiery', 'Κάλτσες & καλσόν', 'Socks & hosiery', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('sports-clothing', 'sportswear-sporting-goods', 'Αθλητική ένδυση', 'Sports clothing', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fitness-accessories', 'sportswear-sporting-goods', 'Fitness & αξεσουάρ άσκησης', 'Fitness accessories', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('team-sports-equipment', 'sportswear-sporting-goods', 'Εξοπλισμός ομαδικών αθλημάτων', 'Team sports equipment', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL);

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
WHERE c.code IN ('bags-accessories-leather','children-baby-clothing','footwear','jewellery-watches','optical-retail','underwear-hosiery','sportswear-sporting-goods')
AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id=c.id)
AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id=c.id);

COMMIT;

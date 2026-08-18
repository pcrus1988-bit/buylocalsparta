-- Buy Local Sparta — customer taxonomy: books, stationery, school, toys and culture
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
  ('books', 'books-stationery-office', 'Βιβλία', 'Books', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('fiction-books', 'books', 'Λογοτεχνία', 'Fiction', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('nonfiction-books', 'books', 'Μη λογοτεχνικά βιβλία', 'Non-fiction', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('children-books', 'books', 'Παιδικά βιβλία', 'Children’s books', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('educational-study-books', 'books', 'Εκπαιδευτικά & βοηθήματα', 'Educational & study books', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('reference-books', 'books', 'Βιβλία αναφοράς', 'Reference books', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('stationery', 'books-stationery-office', 'Χαρτικά', 'Stationery', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('notebooks', 'stationery', 'Τετράδια & σημειωματάρια', 'Notebooks', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('spiral-notebooks', 'notebooks', 'Σπιράλ τετράδια', 'Spiral notebooks', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('exercise-books', 'notebooks', 'Σχολικά τετράδια', 'Exercise books', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('notepads-memo-books', 'notebooks', 'Μπλοκ & σημειωματάρια', 'Notepads & memo books', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('writing-instruments', 'stationery', 'Είδη γραφής', 'Writing instruments', 'navigation_group', false, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('pens', 'writing-instruments', 'Στυλό', 'Pens', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('pencils', 'writing-instruments', 'Μολύβια', 'Pencils', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('mechanical-pencils', 'writing-instruments', 'Μηχανικά μολύβια', 'Mechanical pencils', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('markers-highlighters', 'writing-instruments', 'Μαρκαδόροι & υπογραμμιστές', 'Markers & highlighters', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('erasers-sharpeners', 'writing-instruments', 'Γόμες & ξύστρες', 'Erasers & sharpeners', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('paper-products', 'stationery', 'Χαρτί & προϊόντα χαρτιού', 'Paper & paper products', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('files-folders', 'stationery', 'Ντοσιέ, φάκελοι & αρχειοθέτηση', 'Files, folders & filing', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('art-craft-supplies', 'stationery', 'Είδη ζωγραφικής & χειροτεχνίας', 'Art & craft supplies', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('desk-office-accessories', 'stationery', 'Αξεσουάρ γραφείου', 'Desk & office accessories', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('school-supplies', 'books-stationery-office', 'Σχολικά είδη', 'School supplies', 'navigation_group', false, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('pencil-cases', 'school-supplies', 'Κασετίνες', 'Pencil cases', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('school-bags-backpacks', 'school-supplies', 'Σχολικές τσάντες & σακίδια', 'School bags & backpacks', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('geometry-math-sets', 'school-supplies', 'Γεωμετρικά όργανα', 'Geometry & maths sets', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('book-covers-labels', 'school-supplies', 'Καλύμματα βιβλίων & ετικέτες', 'Book covers & labels', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('school-organisers', 'school-supplies', 'Σχολική οργάνωση', 'School organisers', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('toys', 'toys-hobbies-games', 'Παιχνίδια', 'Toys', 'navigation_group', false, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('dolls-figures', 'toys', 'Κούκλες & φιγούρες', 'Dolls & figures', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('construction-toys', 'toys', 'Κατασκευές & τουβλάκια', 'Construction toys', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('toy-vehicles', 'toys', 'Οχήματα παιχνιδιού', 'Toy vehicles', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('educational-toys', 'toys', 'Εκπαιδευτικά παιχνίδια', 'Educational toys', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('baby-toddler-toys', 'toys', 'Βρεφικά & προσχολικά παιχνίδια', 'Baby & toddler toys', 'product_class', true, 50, NULL, NULL, NULL, NULL, NULL, NULL),
  ('outdoor-toys', 'toys', 'Παιχνίδια εξωτερικού χώρου', 'Outdoor toys', 'product_class', true, 60, NULL, NULL, NULL, NULL, NULL, NULL),
  ('puzzles', 'toys-hobbies-games', 'Παζλ', 'Puzzles', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('games', 'toys-hobbies-games', 'Επιτραπέζια & παιχνίδια καρτών', 'Board & card games', 'navigation_group', false, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('board-games', 'games', 'Επιτραπέζια παιχνίδια', 'Board games', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('card-games', 'games', 'Παιχνίδια καρτών', 'Card games', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('hobby-model-making', 'toys-hobbies-games', 'Μοντελισμός & χόμπι', 'Hobby & model making', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL),
  ('musical-instruments-accessories', 'music-photo-collectibles', 'Μουσικά όργανα & αξεσουάρ', 'Musical instruments & accessories', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('collectibles-memorabilia', 'music-photo-collectibles', 'Συλλεκτικά & αναμνηστικά', 'Collectibles & memorabilia', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('creative-hobbies', 'music-photo-collectibles', 'Δημιουργικά χόμπι', 'Creative hobbies', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('gift-wrap', 'gifts-souvenirs-seasonal', 'Συσκευασία δώρου', 'Gift wrap', 'product_class', true, 10, NULL, NULL, NULL, NULL, NULL, NULL),
  ('greeting-cards', 'gifts-souvenirs-seasonal', 'Ευχετήριες κάρτες', 'Greeting cards', 'product_class', true, 20, NULL, NULL, NULL, NULL, NULL, NULL),
  ('souvenirs', 'gifts-souvenirs-seasonal', 'Αναμνηστικά', 'Souvenirs', 'product_class', true, 30, NULL, NULL, NULL, NULL, NULL, NULL),
  ('seasonal-decorations', 'gifts-souvenirs-seasonal', 'Εποχιακά διακοσμητικά', 'Seasonal decorations', 'product_class', true, 40, NULL, NULL, NULL, NULL, NULL, NULL);

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

UPDATE categories c SET taxonomy_role='navigation_group', assignable=false, updated_at=now() WHERE c.code IN ('music-photo-collectibles','gifts-souvenirs-seasonal') AND NOT EXISTS (SELECT 1 FROM canonical_variants v WHERE v.category_id=c.id) AND NOT EXISTS (SELECT 1 FROM vendor_product_submissions s WHERE s.category_id=c.id);

UPDATE categories SET taxonomy_role='category', assignable=true, updated_at=now() WHERE code IN ('books-stationery-office','toys-hobbies-games');

COMMIT;

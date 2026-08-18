-- Buy Local Sparta production taxonomy derived from the verified vendor research classification.
-- The hierarchy is intentionally shared by vendor onboarding, catalog moderation and storefront filtering.

CREATE UNIQUE INDEX IF NOT EXISTS categories_market_code_uidx
  ON public.categories(market_id, code)
  WHERE market_id IS NOT NULL;

CREATE TEMP TABLE bls_catalog_taxonomy_seed (
  parent_code text,
  code text PRIMARY KEY,
  en_name text NOT NULL,
  el_name text NOT NULL,
  commerce_mode text NOT NULL,
  compatibility boolean NOT NULL DEFAULT false,
  counteroffer boolean NOT NULL DEFAULT true,
  fulfilment_modes text[] NOT NULL DEFAULT ARRAY['pickup','local_delivery','shipping']::text[]
) ON COMMIT DROP;

INSERT INTO bls_catalog_taxonomy_seed(parent_code,code,en_name,el_name,commerce_mode,compatibility,counteroffer,fulfilment_modes) VALUES
(NULL,'agriculture-pets-outdoors','Agriculture, pets & outdoors','Γεωργία, κατοικίδια & ύπαιθρος','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'automotive-mobility','Automotive & mobility','Αυτοκίνηση & κινητικότητα','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'beauty-health-retail','Beauty & health retail','Ομορφιά & υγεία','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'books-toys-culture','Books, toys & culture','Βιβλία, παιχνίδια & πολιτισμός','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'diy-building-trade','DIY, building & trade','DIY, οικοδομή & επαγγελματικά είδη','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'fashion-personal-accessories','Fashion & personal accessories','Μόδα & προσωπικά αξεσουάρ','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'home-furniture-garden','Home, furniture & garden','Σπίτι, έπιπλα & κήπος','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'specialist-retail','Specialist retail','Εξειδικευμένο λιανικό εμπόριο','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
(NULL,'technology-appliances','Technology & appliances','Τεχνολογία & συσκευές','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('agriculture-pets-outdoors','agricultural-supplies-machinery','Agricultural supplies & machinery','Γεωργικά εφόδια & μηχανήματα','regulated_mixed',false,false,ARRAY['pickup','local_delivery']),
('agriculture-pets-outdoors','beekeeping-supplies','Beekeeping supplies','Μελισσοκομικά είδη','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('agriculture-pets-outdoors','hunting-fishing-outdoor-goods','Hunting, fishing & outdoor goods','Είδη κυνηγιού, αλιείας & υπαίθρου','regulated_mixed',false,false,ARRAY['pickup','local_delivery']),
('agriculture-pets-outdoors','pet-animal-supplies','Pet & animal supplies','Είδη κατοικιδίων & ζώων','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('automotive-mobility','automotive-parts-accessories','Parts, batteries, tyres & accessories','Ανταλλακτικά, μπαταρίες, ελαστικά & αξεσουάρ','compatibility_sensitive',true,true,ARRAY['pickup','local_delivery','shipping']),
('automotive-mobility','vehicles-motorcycles-bicycles','Vehicles, motorcycles & bicycles','Οχήματα, μοτοσυκλέτες & ποδήλατα','vehicles',true,true,ARRAY['pickup','local_delivery']),
('beauty-health-retail','cosmetics-perfumery','Cosmetics & perfumery','Καλλυντικά & αρωματοποιία','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('beauty-health-retail','medical-orthopaedic-hearing','Orthopaedic, medical & hearing goods','Ορθοπεδικά, ιατρικά & ακουστικά είδη','regulated_mixed',false,false,ARRAY['pickup']),
('beauty-health-retail','pharmacies','Pharmacies','Φαρμακεία','directory_only',false,false,ARRAY[]::text[]),
('books-toys-culture','books-stationery-office','Books, stationery & office supplies','Βιβλία, χαρτικά & είδη γραφείου','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('books-toys-culture','gifts-souvenirs-seasonal','Gifts, souvenirs & seasonal','Δώρα, αναμνηστικά & εποχιακά είδη','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('books-toys-culture','music-photo-collectibles','Music, photo & collectibles','Μουσική, φωτογραφία & συλλεκτικά','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('books-toys-culture','toys-hobbies-games','Toys, hobbies & games','Παιχνίδια, χόμπι & επιτραπέζια','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('diy-building-trade','building-materials-timber','Building materials & timber','Οικοδομικά υλικά & ξυλεία','logistics_sensitive',false,true,ARRAY['pickup','local_delivery','shipping']),
('diy-building-trade','doors-windows-aluminium-railings','Doors, windows, aluminium & railings','Πόρτες, παράθυρα, αλουμίνια & κιγκλιδώματα','logistics_sensitive',false,true,ARRAY['pickup','local_delivery']),
('diy-building-trade','hardware-tools-paint','Hardware, tools & paint','Σιδηρικά, εργαλεία & χρώματα','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('diy-building-trade','sanitary-plumbing-glazing','Sanitary, plumbing & glazing goods','Είδη υγιεινής, υδραυλικά & υαλοπίνακες','logistics_sensitive',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','adult-clothing','Adult clothing','Ανδρικά & γυναικεία ρούχα','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','bags-accessories-leather','Bags, accessories & leather goods','Τσάντες, αξεσουάρ & δερμάτινα είδη','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','children-baby-clothing','Children''s & baby clothing','Παιδικά & βρεφικά ρούχα','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','footwear','Footwear','Υποδήματα','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','jewellery-watches','Jewellery & watches','Κοσμήματα & ρολόγια','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','optical-retail','Optical retail','Οπτικά είδη','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','sportswear-sporting-goods','Sportswear & sporting goods','Αθλητικά ρούχα & αθλητικά είδη','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('fashion-personal-accessories','underwear-hosiery','Underwear & hosiery','Εσώρουχα & καλσόν','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('home-furniture-garden','beds-mattresses','Beds & mattresses','Κρεβάτια & στρώματα','logistics_sensitive',false,true,ARRAY['pickup','local_delivery']),
('home-furniture-garden','flowers-plants-garden','Flowers, plants & garden','Άνθη, φυτά & κήπος','standard',false,true,ARRAY['pickup','local_delivery']),
('home-furniture-garden','furniture-kitchens','Furniture & kitchens','Έπιπλα & κουζίνες','logistics_sensitive',false,true,ARRAY['pickup','local_delivery']),
('home-furniture-garden','heating-cooling-fireplaces','Heating, cooling & fireplaces','Θέρμανση, ψύξη & τζάκια','logistics_sensitive',false,true,ARRAY['pickup','local_delivery']),
('home-furniture-garden','homeware-household-goods','Homeware & household goods','Οικιακά είδη','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('home-furniture-garden','lighting-decor','Lighting & décor','Φωτισμός & διακόσμηση','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('home-furniture-garden','textiles-linen-curtains-carpets','Textiles, linen, curtains & carpets','Υφάσματα, λευκά είδη, κουρτίνες & χαλιά','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('specialist-retail','packaging-shop-office-equipment','Packaging, shop & office equipment','Συσκευασία, εξοπλισμός καταστημάτων & γραφείου','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('specialist-retail','religious-ceremonial-goods','Religious & ceremonial goods','Θρησκευτικά & είδη τελετών','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('specialist-retail','tobacco-smoking-goods','Tobacco & smoking goods','Καπνικά & είδη καπνιστή','directory_only',false,false,ARRAY[]::text[]),
('technology-appliances','computers-peripherals','Computers & peripherals','Υπολογιστές & περιφερειακά','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('technology-appliances','electrical-appliances','Electrical appliances','Ηλεκτρικές συσκευές','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('technology-appliances','electrical-security-business-equipment','Electrical, security & business equipment','Ηλεκτρολογικός, ασφαλείας & επαγγελματικός εξοπλισμός','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('technology-appliances','mobile-telecom-electronics','Mobile, telecom & electronics','Κινητά, τηλεπικοινωνίες & ηλεκτρονικά','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('adult-clothing','fashion-womens-dresses','Women''s dresses','Γυναικεία φορέματα','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('adult-clothing','fashion-womens-shirts','Women''s shirts','Γυναικεία πουκάμισα','standard',false,true,ARRAY['pickup','local_delivery','shipping']),
('adult-clothing','fashion-womens-tops','Women''s tops','Γυναικεία τοπ','standard',false,true,ARRAY['pickup','local_delivery','shipping']);

INSERT INTO public.categories(id,market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,advice_allowed,checkout_fulfilment_modes,created_at)
SELECT gen_random_uuid(),m.id,NULL,s.code,s.code,s.commerce_mode,true,jsonb_build_object('node','department','source','vendor_research_profiles'),'{}'::jsonb,s.compatibility,false,s.counteroffer,true,s.fulfilment_modes,now()
FROM bls_catalog_taxonomy_seed s JOIN public.markets m ON m.code='sparta'
WHERE s.parent_code IS NULL
ON CONFLICT (market_id,code) WHERE market_id IS NOT NULL DO UPDATE SET
  parent_id=NULL,slug=EXCLUDED.slug,commerce_mode=EXCLUDED.commerce_mode,active=true,filter_schema=EXCLUDED.filter_schema,
  require_compatibility_confirmation=EXCLUDED.require_compatibility_confirmation,regulated_checkout_allowed=false,
  counteroffer_allowed=EXCLUDED.counteroffer_allowed,advice_allowed=true,checkout_fulfilment_modes=EXCLUDED.checkout_fulfilment_modes;

INSERT INTO public.categories(id,market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,advice_allowed,checkout_fulfilment_modes,created_at)
SELECT gen_random_uuid(),m.id,p.id,s.code,s.code,s.commerce_mode,true,jsonb_build_object('node','category','source','vendor_research_profiles'),'{}'::jsonb,s.compatibility,false,s.counteroffer,true,s.fulfilment_modes,now()
FROM bls_catalog_taxonomy_seed s JOIN public.markets m ON m.code='sparta' JOIN public.categories p ON p.market_id=m.id AND p.code=s.parent_code
WHERE s.parent_code IS NOT NULL AND s.parent_code<>'adult-clothing'
ON CONFLICT (market_id,code) WHERE market_id IS NOT NULL DO UPDATE SET
  parent_id=EXCLUDED.parent_id,slug=EXCLUDED.slug,commerce_mode=EXCLUDED.commerce_mode,active=true,filter_schema=EXCLUDED.filter_schema,
  require_compatibility_confirmation=EXCLUDED.require_compatibility_confirmation,regulated_checkout_allowed=false,
  counteroffer_allowed=EXCLUDED.counteroffer_allowed,advice_allowed=true,checkout_fulfilment_modes=EXCLUDED.checkout_fulfilment_modes;

INSERT INTO public.categories(id,market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,advice_allowed,checkout_fulfilment_modes,created_at)
SELECT gen_random_uuid(),m.id,p.id,s.code,s.code,s.commerce_mode,true,jsonb_build_object('node','subcategory','source','catalog_detail'),'{}'::jsonb,s.compatibility,false,s.counteroffer,true,s.fulfilment_modes,now()
FROM bls_catalog_taxonomy_seed s JOIN public.markets m ON m.code='sparta' JOIN public.categories p ON p.market_id=m.id AND p.code=s.parent_code
WHERE s.parent_code='adult-clothing'
ON CONFLICT (market_id,code) WHERE market_id IS NOT NULL DO UPDATE SET parent_id=EXCLUDED.parent_id,slug=EXCLUDED.slug,active=true;

INSERT INTO public.category_translations(category_id,locale,name,description,seo_title,seo_description)
SELECT c.id,'en',s.en_name,'Buy Local Sparta catalog category based on the verified local merchant research taxonomy.',s.en_name||' in Sparta','Discover local Sparta merchants and products in '||s.en_name||'.'
FROM bls_catalog_taxonomy_seed s JOIN public.markets m ON m.code='sparta' JOIN public.categories c ON c.market_id=m.id AND c.code=s.code
UNION ALL
SELECT c.id,'el',s.el_name,'Κατηγορία του Buy Local Sparta βασισμένη στην επαληθευμένη έρευνα τοπικών εμπόρων.',s.el_name||' στη Σπάρτη','Ανακαλύψτε τοπικά καταστήματα και προϊόντα στη Σπάρτη στην κατηγορία '||s.el_name||'.'
FROM bls_catalog_taxonomy_seed s JOIN public.markets m ON m.code='sparta' JOIN public.categories c ON c.market_id=m.id AND c.code=s.code
ON CONFLICT(category_id,locale) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description;

CREATE TABLE IF NOT EXISTS public.category_aliases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  source_namespace text NOT NULL DEFAULT 'vendor_research_sub_branch',
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS category_aliases_market_source_alias_uidx ON public.category_aliases(market_id,source_namespace,lower(alias));
CREATE INDEX IF NOT EXISTS category_aliases_category_idx ON public.category_aliases(category_id);
ALTER TABLE public.category_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bls_platform_runtime_all ON public.category_aliases;
CREATE POLICY bls_platform_runtime_all ON public.category_aliases FOR ALL USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
REVOKE ALL ON public.category_aliases FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.category_aliases TO bls_app_runtime,bls_platform_runtime;

INSERT INTO public.category_aliases(id,market_id,category_id,source_namespace,alias,created_at)
SELECT gen_random_uuid(),m.id,c.id,'vendor_research_sub_branch',s.en_name,now()
FROM bls_catalog_taxonomy_seed s JOIN public.markets m ON m.code='sparta' JOIN public.categories c ON c.market_id=m.id AND c.code=s.code
WHERE s.parent_code IS NOT NULL
ON CONFLICT (market_id,source_namespace,(lower(alias))) DO UPDATE SET category_id=EXCLUDED.category_id;

WITH aliases(alias,code) AS (VALUES
('Beauty & personal care','cosmetics-perfumery'),('Books & publishing','books-stationery-office'),('Books, courses & digital products','books-stationery-office'),
('Fashion & accessories','fashion-personal-accessories'),('Gifts & home accessories','gifts-souvenirs-seasonal'),('Home, hardware & household','home-furniture-garden'),
('Jewellery & accessories','jewellery-watches'),('Lighting & electrical','technology-appliances'),('Office, printing & technology','technology-appliances'),
('Shoes & leather goods','fashion-personal-accessories'),('Tiles, bathroom & building materials','sanitary-plumbing-glazing'),('Toys, gifts & children''s goods','books-toys-culture'))
INSERT INTO public.category_aliases(id,market_id,category_id,source_namespace,alias,created_at)
SELECT gen_random_uuid(),m.id,c.id,'vendor_research_sub_branch',a.alias,now()
FROM aliases a JOIN public.markets m ON m.code='sparta' JOIN public.categories c ON c.market_id=m.id AND c.code=a.code
ON CONFLICT (market_id,source_namespace,(lower(alias))) DO UPDATE SET category_id=EXCLUDED.category_id;

-- A concurrently seeded generic `fashion` root is redundant. Preserve any detailed leaves/products by reparenting first.
DO $$
DECLARE m_id uuid; adult_id uuid; old_root uuid;
BEGIN
  SELECT id INTO m_id FROM public.markets WHERE code='sparta' LIMIT 1;
  SELECT id INTO adult_id FROM public.categories WHERE market_id=m_id AND code='adult-clothing' LIMIT 1;
  SELECT id INTO old_root FROM public.categories WHERE market_id=m_id AND code='fashion' LIMIT 1;
  UPDATE public.categories SET parent_id=adult_id WHERE market_id=m_id AND code IN ('fashion-womens-dresses','fashion-womens-shirts','fashion-womens-tops');
  IF old_root IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories WHERE parent_id=old_root)
     AND NOT EXISTS(SELECT 1 FROM public.canonical_variants WHERE category_id=old_root)
     AND NOT EXISTS(SELECT 1 FROM public.vendor_product_submissions WHERE category_id=old_root) THEN
    DELETE FROM public.categories WHERE id=old_root;
  END IF;
END $$;
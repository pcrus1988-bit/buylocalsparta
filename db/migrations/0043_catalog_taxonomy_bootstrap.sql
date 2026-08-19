-- Buy Local Sparta — production taxonomy bootstrap restored from the applied Supabase 0043a migration.
-- This establishes the canonical Sparta departments and first-level merchant research taxonomy
-- required by the deeper catalogue migrations that follow.

CREATE UNIQUE INDEX IF NOT EXISTS categories_market_code_uidx
  ON public.categories(market_id,code) WHERE market_id IS NOT NULL;

WITH seed(code,slug,en_name,el_name) AS (VALUES
('agriculture-pets-outdoors','agriculture-pets-outdoors','Agriculture, pets & outdoors','Γεωργία, κατοικίδια & ύπαιθρος'),
('automotive-mobility','automotive-mobility','Automotive & mobility','Αυτοκίνηση & κινητικότητα'),
('beauty-health-retail','beauty-health-retail','Beauty & health retail','Ομορφιά & υγεία'),
('books-toys-culture','books-toys-culture','Books, toys & culture','Βιβλία, παιχνίδια & πολιτισμός'),
('diy-building-trade','diy-building-trade','DIY, building & trade','DIY, οικοδομή & επαγγελματικά είδη'),
('fashion-personal-accessories','fashion-personal-accessories','Fashion & personal accessories','Μόδα & προσωπικά αξεσουάρ'),
('home-furniture-garden','home-furniture-garden','Home, furniture & garden','Σπίτι, έπιπλα & κήπος'),
('specialist-retail','specialist-retail','Specialist retail','Εξειδικευμένο λιανικό εμπόριο'),
('technology-appliances','technology-appliances','Technology & appliances','Τεχνολογία & συσκευές'))
INSERT INTO public.categories(
  id,market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
  require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,
  advice_allowed,checkout_fulfilment_modes,created_at
)
SELECT gen_random_uuid(),m.id,NULL,s.code,s.slug,'standard',true,
       '{"node":"department"}'::jsonb,'{}'::jsonb,false,false,true,true,
       ARRAY['pickup','local_delivery','shipping']::text[],now()
FROM public.markets m CROSS JOIN seed s
WHERE m.code='sparta'
ON CONFLICT (market_id,code) WHERE market_id IS NOT NULL
DO UPDATE SET slug=EXCLUDED.slug,active=true,filter_schema=EXCLUDED.filter_schema,
              advice_allowed=EXCLUDED.advice_allowed;

WITH seed(parent_code,code,slug,en_name,el_name,commerce_mode,compatibility,counteroffer,advice,fulfilment_modes) AS (VALUES
('agriculture-pets-outdoors','agricultural-supplies-machinery','agricultural-supplies-machinery','Agricultural supplies & machinery','Γεωργικά εφόδια & μηχανήματα','regulated_mixed',false,false,true,ARRAY['pickup','local_delivery']::text[]),
('agriculture-pets-outdoors','beekeeping-supplies','beekeeping-supplies','Beekeeping supplies','Μελισσοκομικά είδη','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('agriculture-pets-outdoors','hunting-fishing-outdoor-goods','hunting-fishing-outdoor-goods','Hunting, fishing & outdoor goods','Είδη κυνηγιού, αλιείας & υπαίθρου','regulated_mixed',false,false,true,ARRAY['pickup','local_delivery']::text[]),
('agriculture-pets-outdoors','pet-animal-supplies','pet-animal-supplies','Pet & animal supplies','Είδη κατοικιδίων & ζώων','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('automotive-mobility','automotive-parts-accessories','automotive-parts-accessories','Parts, batteries, tyres & accessories','Ανταλλακτικά, μπαταρίες, ελαστικά & αξεσουάρ','compatibility_sensitive',true,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('automotive-mobility','vehicles-motorcycles-bicycles','vehicles-motorcycles-bicycles','Vehicles, motorcycles & bicycles','Οχήματα, μοτοσυκλέτες & ποδήλατα','vehicles',true,true,true,ARRAY['pickup','local_delivery']::text[]),
('beauty-health-retail','cosmetics-perfumery','cosmetics-perfumery','Cosmetics & perfumery','Καλλυντικά & αρωματοποιία','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('beauty-health-retail','medical-orthopaedic-hearing','medical-orthopaedic-hearing','Orthopaedic, medical & hearing goods','Ορθοπεδικά, ιατρικά & ακουστικά είδη','regulated_mixed',false,false,true,ARRAY['pickup']::text[]),
('beauty-health-retail','pharmacies','pharmacies','Pharmacies','Φαρμακεία','directory_only',false,false,true,ARRAY[]::text[]),
('books-toys-culture','books-stationery-office','books-stationery-office','Books, stationery & office supplies','Βιβλία, χαρτικά & είδη γραφείου','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('books-toys-culture','gifts-souvenirs-seasonal','gifts-souvenirs-seasonal','Gifts, souvenirs & seasonal','Δώρα, αναμνηστικά & εποχιακά είδη','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('books-toys-culture','music-photo-collectibles','music-photo-collectibles','Music, photo & collectibles','Μουσική, φωτογραφία & συλλεκτικά','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('books-toys-culture','toys-hobbies-games','toys-hobbies-games','Toys, hobbies & games','Παιχνίδια, χόμπι & επιτραπέζια','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('diy-building-trade','building-materials-timber','building-materials-timber','Building materials & timber','Οικοδομικά υλικά & ξυλεία','logistics_sensitive',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('diy-building-trade','doors-windows-aluminium-railings','doors-windows-aluminium-railings','Doors, windows, aluminium & railings','Πόρτες, παράθυρα, αλουμίνια & κιγκλιδώματα','logistics_sensitive',false,true,true,ARRAY['pickup','local_delivery']::text[]),
('diy-building-trade','hardware-tools-paint','hardware-tools-paint','Hardware, tools & paint','Σιδηρικά, εργαλεία & χρώματα','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('diy-building-trade','sanitary-plumbing-glazing','sanitary-plumbing-glazing','Sanitary, plumbing & glazing goods','Είδη υγιεινής, υδραυλικά & υαλοπίνακες','logistics_sensitive',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','adult-clothing','adult-clothing','Adult clothing','Ανδρικά & γυναικεία ρούχα','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','bags-accessories-leather','bags-accessories-leather','Bags, accessories & leather goods','Τσάντες, αξεσουάρ & δερμάτινα είδη','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','children-baby-clothing','children-baby-clothing','Children''s & baby clothing','Παιδικά & βρεφικά ρούχα','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','footwear','footwear','Footwear','Υποδήματα','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','jewellery-watches','jewellery-watches','Jewellery & watches','Κοσμήματα & ρολόγια','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','optical-retail','optical-retail','Optical retail','Οπτικά είδη','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','sportswear-sporting-goods','sportswear-sporting-goods','Sportswear & sporting goods','Αθλητικά ρούχα & αθλητικά είδη','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('fashion-personal-accessories','underwear-hosiery','underwear-hosiery','Underwear & hosiery','Εσώρουχα & καλσόν','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('home-furniture-garden','beds-mattresses','beds-mattresses','Beds & mattresses','Κρεβάτια & στρώματα','logistics_sensitive',false,true,true,ARRAY['pickup','local_delivery']::text[]),
('home-furniture-garden','flowers-plants-garden','flowers-plants-garden','Flowers, plants & garden','Άνθη, φυτά & κήπος','standard',false,true,true,ARRAY['pickup','local_delivery']::text[]),
('home-furniture-garden','furniture-kitchens','furniture-kitchens','Furniture & kitchens','Έπιπλα & κουζίνες','logistics_sensitive',false,true,true,ARRAY['pickup','local_delivery']::text[]),
('home-furniture-garden','heating-cooling-fireplaces','heating-cooling-fireplaces','Heating, cooling & fireplaces','Θέρμανση, ψύξη & τζάκια','logistics_sensitive',false,true,true,ARRAY['pickup','local_delivery']::text[]),
('home-furniture-garden','homeware-household-goods','homeware-household-goods','Homeware & household goods','Οικιακά είδη','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('home-furniture-garden','lighting-decor','lighting-decor','Lighting & décor','Φωτισμός & διακόσμηση','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('home-furniture-garden','textiles-linen-curtains-carpets','textiles-linen-curtains-carpets','Textiles, linen, curtains & carpets','Υφάσματα, λευκά είδη, κουρτίνες & χαλιά','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('specialist-retail','packaging-shop-office-equipment','packaging-shop-office-equipment','Packaging, shop & office equipment','Συσκευασία, εξοπλισμός καταστημάτων & γραφείου','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('specialist-retail','religious-ceremonial-goods','religious-ceremonial-goods','Religious & ceremonial goods','Θρησκευτικά & είδη τελετών','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('specialist-retail','tobacco-smoking-goods','tobacco-smoking-goods','Tobacco & smoking goods','Καπνικά & είδη καπνιστή','directory_only',false,false,true,ARRAY[]::text[]),
('technology-appliances','computers-peripherals','computers-peripherals','Computers & peripherals','Υπολογιστές & περιφερειακά','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('technology-appliances','electrical-appliances','electrical-appliances','Electrical appliances','Ηλεκτρικές συσκευές','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('technology-appliances','electrical-security-business-equipment','electrical-security-business-equipment','Electrical, security & business equipment','Ηλεκτρολογικός, ασφαλείας & επαγγελματικός εξοπλισμός','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]),
('technology-appliances','mobile-telecom-electronics','mobile-telecom-electronics','Mobile, telecom & electronics','Κινητά, τηλεπικοινωνίες & ηλεκτρονικά','standard',false,true,true,ARRAY['pickup','local_delivery','shipping']::text[]))
INSERT INTO public.categories(
  id,market_id,parent_id,code,slug,commerce_mode,active,filter_schema,sort_config,
  require_compatibility_confirmation,regulated_checkout_allowed,counteroffer_allowed,
  advice_allowed,checkout_fulfilment_modes,created_at
)
SELECT gen_random_uuid(),m.id,p.id,s.code,s.slug,s.commerce_mode,true,
       jsonb_build_object('node','category','source','vendor_research_profiles'),'{}'::jsonb,
       s.compatibility,false,s.counteroffer,s.advice,s.fulfilment_modes,now()
FROM public.markets m
JOIN seed s ON true
JOIN public.categories p ON p.market_id=m.id AND p.code=s.parent_code
WHERE m.code='sparta'
ON CONFLICT (market_id,code) WHERE market_id IS NOT NULL
DO UPDATE SET parent_id=EXCLUDED.parent_id,slug=EXCLUDED.slug,commerce_mode=EXCLUDED.commerce_mode,
              active=true,filter_schema=EXCLUDED.filter_schema,
              require_compatibility_confirmation=EXCLUDED.require_compatibility_confirmation,
              regulated_checkout_allowed=EXCLUDED.regulated_checkout_allowed,
              counteroffer_allowed=EXCLUDED.counteroffer_allowed,
              advice_allowed=EXCLUDED.advice_allowed,
              checkout_fulfilment_modes=EXCLUDED.checkout_fulfilment_modes;

WITH names(code,en_name,el_name) AS (VALUES
('agriculture-pets-outdoors','Agriculture, pets & outdoors','Γεωργία, κατοικίδια & ύπαιθρος'),
('automotive-mobility','Automotive & mobility','Αυτοκίνηση & κινητικότητα'),
('beauty-health-retail','Beauty & health retail','Ομορφιά & υγεία'),
('books-toys-culture','Books, toys & culture','Βιβλία, παιχνίδια & πολιτισμός'),
('diy-building-trade','DIY, building & trade','DIY, οικοδομή & επαγγελματικά είδη'),
('fashion-personal-accessories','Fashion & personal accessories','Μόδα & προσωπικά αξεσουάρ'),
('home-furniture-garden','Home, furniture & garden','Σπίτι, έπιπλα & κήπος'),
('specialist-retail','Specialist retail','Εξειδικευμένο λιανικό εμπόριο'),
('technology-appliances','Technology & appliances','Τεχνολογία & συσκευές'),
('agricultural-supplies-machinery','Agricultural supplies & machinery','Γεωργικά εφόδια & μηχανήματα'),
('beekeeping-supplies','Beekeeping supplies','Μελισσοκομικά είδη'),
('hunting-fishing-outdoor-goods','Hunting, fishing & outdoor goods','Είδη κυνηγιού, αλιείας & υπαίθρου'),
('pet-animal-supplies','Pet & animal supplies','Είδη κατοικιδίων & ζώων'),
('automotive-parts-accessories','Parts, batteries, tyres & accessories','Ανταλλακτικά, μπαταρίες, ελαστικά & αξεσουάρ'),
('vehicles-motorcycles-bicycles','Vehicles, motorcycles & bicycles','Οχήματα, μοτοσυκλέτες & ποδήλατα'),
('cosmetics-perfumery','Cosmetics & perfumery','Καλλυντικά & αρωματοποιία'),
('medical-orthopaedic-hearing','Orthopaedic, medical & hearing goods','Ορθοπεδικά, ιατρικά & ακουστικά είδη'),
('pharmacies','Pharmacies','Φαρμακεία'),
('books-stationery-office','Books, stationery & office supplies','Βιβλία, χαρτικά & είδη γραφείου'),
('gifts-souvenirs-seasonal','Gifts, souvenirs & seasonal','Δώρα, αναμνηστικά & εποχιακά είδη'),
('music-photo-collectibles','Music, photo & collectibles','Μουσική, φωτογραφία & συλλεκτικά'),
('toys-hobbies-games','Toys, hobbies & games','Παιχνίδια, χόμπι & επιτραπέζια'),
('building-materials-timber','Building materials & timber','Οικοδομικά υλικά & ξυλεία'),
('doors-windows-aluminium-railings','Doors, windows, aluminium & railings','Πόρτες, παράθυρα, αλουμίνια & κιγκλιδώματα'),
('hardware-tools-paint','Hardware, tools & paint','Σιδηρικά, εργαλεία & χρώματα'),
('sanitary-plumbing-glazing','Sanitary, plumbing & glazing goods','Είδη υγιεινής, υδραυλικά & υαλοπίνακες'),
('adult-clothing','Adult clothing','Ανδρικά & γυναικεία ρούχα'),
('bags-accessories-leather','Bags, accessories & leather goods','Τσάντες, αξεσουάρ & δερμάτινα είδη'),
('children-baby-clothing','Children''s & baby clothing','Παιδικά & βρεφικά ρούχα'),
('footwear','Footwear','Υποδήματα'),
('jewellery-watches','Jewellery & watches','Κοσμήματα & ρολόγια'),
('optical-retail','Optical retail','Οπτικά είδη'),
('sportswear-sporting-goods','Sportswear & sporting goods','Αθλητικά ρούχα & αθλητικά είδη'),
('underwear-hosiery','Underwear & hosiery','Εσώρουχα & καλσόν'),
('beds-mattresses','Beds & mattresses','Κρεβάτια & στρώματα'),
('flowers-plants-garden','Flowers, plants & garden','Άνθη, φυτά & κήπος'),
('furniture-kitchens','Furniture & kitchens','Έπιπλα & κουζίνες'),
('heating-cooling-fireplaces','Heating, cooling & fireplaces','Θέρμανση, ψύξη & τζάκια'),
('homeware-household-goods','Homeware & household goods','Οικιακά είδη'),
('lighting-decor','Lighting & décor','Φωτισμός & διακόσμηση'),
('textiles-linen-curtains-carpets','Textiles, linen, curtains & carpets','Υφάσματα, λευκά είδη, κουρτίνες & χαλιά'),
('packaging-shop-office-equipment','Packaging, shop & office equipment','Συσκευασία, εξοπλισμός καταστημάτων & γραφείου'),
('religious-ceremonial-goods','Religious & ceremonial goods','Θρησκευτικά & είδη τελετών'),
('tobacco-smoking-goods','Tobacco & smoking goods','Καπνικά & είδη καπνιστή'),
('computers-peripherals','Computers & peripherals','Υπολογιστές & περιφερειακά'),
('electrical-appliances','Electrical appliances','Ηλεκτρικές συσκευές'),
('electrical-security-business-equipment','Electrical, security & business equipment','Ηλεκτρολογικός, ασφαλείας & επαγγελματικός εξοπλισμός'),
('mobile-telecom-electronics','Mobile, telecom & electronics','Κινητά, τηλεπικοινωνίες & ηλεκτρονικά'))
INSERT INTO public.category_translations(category_id,locale,name,description,seo_title,seo_description)
SELECT c.id,'en',n.en_name,
       'Buy Local Sparta catalog category based on the verified local merchant research taxonomy.',
       n.en_name||' in Sparta','Discover local Sparta merchants and products in '||n.en_name||'.'
FROM names n
JOIN public.markets m ON m.code='sparta'
JOIN public.categories c ON c.market_id=m.id AND c.code=n.code
UNION ALL
SELECT c.id,'el',n.el_name,
       'Κατηγορία του Buy Local Sparta βασισμένη στην επαληθευμένη έρευνα τοπικών εμπόρων.',
       n.el_name||' στη Σπάρτη','Ανακαλύψτε τοπικά καταστήματα και προϊόντα στη Σπάρτη στην κατηγορία '||n.el_name||'.'
FROM names n
JOIN public.markets m ON m.code='sparta'
JOIN public.categories c ON c.market_id=m.id AND c.code=n.code
ON CONFLICT (category_id,locale)
DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
              seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description;

CREATE TABLE IF NOT EXISTS public.category_aliases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  source_namespace text NOT NULL DEFAULT 'vendor_research_sub_branch',
  alias text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS category_aliases_market_source_alias_uidx
  ON public.category_aliases(market_id,source_namespace,lower(alias));
CREATE INDEX IF NOT EXISTS category_aliases_category_idx
  ON public.category_aliases(category_id);
ALTER TABLE public.category_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bls_platform_runtime_all ON public.category_aliases;
CREATE POLICY bls_platform_runtime_all ON public.category_aliases
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));
REVOKE ALL ON public.category_aliases FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.category_aliases
  TO bls_app_runtime,bls_platform_runtime;

WITH aliases(alias,category_code) AS (VALUES
('Beauty & personal care','cosmetics-perfumery'),
('Books & publishing','books-stationery-office'),
('Books, courses & digital products','books-stationery-office'),
('Fashion & accessories','fashion-personal-accessories'),
('Gifts & home accessories','gifts-souvenirs-seasonal'),
('Home, hardware & household','home-furniture-garden'),
('Jewellery & accessories','jewellery-watches'),
('Lighting & electrical','technology-appliances'),
('Office, printing & technology','technology-appliances'),
('Shoes & leather goods','fashion-personal-accessories'),
('Tiles, bathroom & building materials','sanitary-plumbing-glazing'),
('Toys, gifts & children''s goods','books-toys-culture'))
INSERT INTO public.category_aliases(id,market_id,category_id,source_namespace,alias,created_at)
SELECT gen_random_uuid(),m.id,c.id,'vendor_research_sub_branch',a.alias,now()
FROM aliases a
JOIN public.markets m ON m.code='sparta'
JOIN public.categories c ON c.market_id=m.id AND c.code=a.category_code
ON CONFLICT (market_id,source_namespace,(lower(alias)))
DO UPDATE SET category_id=EXCLUDED.category_id;

-- Source-aligned initial taxonomy and plan configuration.
-- Standard plan prices are seeded as DRAFT because Blueprint v1.0 says they remain unapproved.

DO $$
DECLARE m uuid;
DECLARE parent uuid;
BEGIN
  SELECT id INTO m FROM markets WHERE code='sparta';

  INSERT INTO vendor_plans(market_id,code,name,status,monthly_price_minor,annual_price_minor,term_price_minor,term_months,sales_fee_bps,entitlements)
  VALUES
    (m,'free','Free Discovery','active',0,0,NULL,NULL,700,'{"showcase_limit":20,"counteroffer_monthly":5,"checkout_requires_verification":true}'),
    (m,'founding','Founding Partner','active',NULL,NULL,150000,36,0,'{"catalog":"fair_use","standard_features":true,"priority_support":true,"assisted_launch":true}'),
    (m,'local','Local','draft',2900,29000,NULL,NULL,500,'{"product_limit":200,"basic_analytics":true,"checkout":true}'),
    (m,'growth','Growth','draft',6900,69000,NULL,NULL,250,'{"product_limit":1000,"advanced_analytics":true,"csv_feed":true}'),
    (m,'pro','Pro','draft',12900,129000,NULL,NULL,0,'{"catalog":"fair_use","api_feed":true,"advanced_tools":true}');

  -- Major branch: Fashion & personal accessories
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'fashion','fashion-personal-accessories','standard') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Fashion & personal accessories',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'adult_clothing','adult-clothing','standard'),(m,parent,'bags_accessories','bags-accessories-leather','standard'),
    (m,parent,'children_clothing','children-baby-clothing','standard'),(m,parent,'footwear','footwear','standard'),
    (m,parent,'jewellery_watches','jewellery-watches','standard'),(m,parent,'optical','optical-retail','compatibility_sensitive'),
    (m,parent,'sportswear','sportswear-sporting-goods','standard'),(m,parent,'underwear','underwear-hosiery','standard');

  -- Agriculture, pets & outdoors
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'agriculture_pets_outdoors','agriculture-pets-outdoors','compatibility_sensitive') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Agriculture, pets & outdoors',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'agri_supplies','agricultural-supplies-machinery','compatibility_sensitive'),(m,parent,'beekeeping','beekeeping-supplies','compatibility_sensitive'),
    (m,parent,'hunting_fishing','hunting-fishing-outdoor-goods','regulated_mixed'),(m,parent,'pet_supplies','pet-animal-supplies','standard');

  -- DIY, building & trade
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'diy_trade','diy-building-trade','logistics_sensitive') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','DIY, building & trade',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'building_materials','building-materials-timber','logistics_sensitive'),(m,parent,'doors_windows','doors-windows-aluminium-railings','logistics_sensitive'),
    (m,parent,'hardware_tools','hardware-tools-paint','compatibility_sensitive'),(m,parent,'sanitary_plumbing','sanitary-plumbing-glazing','compatibility_sensitive');

  -- Beauty & health retail
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'beauty_health','beauty-health-retail','standard') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Beauty & health retail',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'cosmetics','cosmetics-perfumery','standard'),(m,parent,'orthopaedic_medical','orthopaedic-medical-hearing','regulated_mixed'),
    (m,parent,'pharmacies','pharmacies','regulated_mixed');

  -- Home, furniture & garden
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'home_furniture_garden','home-furniture-garden','logistics_sensitive') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Home, furniture & garden',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'beds_mattresses','beds-mattresses','logistics_sensitive'),(m,parent,'flowers_plants','flowers-plants-garden','logistics_sensitive'),
    (m,parent,'furniture_kitchens','furniture-kitchens','logistics_sensitive'),(m,parent,'heating_cooling','heating-cooling-fireplaces','compatibility_sensitive'),
    (m,parent,'homeware','homeware-household-goods','standard'),(m,parent,'lighting_decor','lighting-decor','standard'),
    (m,parent,'textiles','textiles-linen-curtains-carpets','standard');

  -- Technology & appliances
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'technology','technology-appliances','compatibility_sensitive') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Technology & appliances',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'computers','computers-peripherals','compatibility_sensitive'),(m,parent,'appliances','electrical-appliances','standard'),
    (m,parent,'security_business','electrical-security-business-equipment','compatibility_sensitive'),(m,parent,'mobile_telecom','mobile-telecom-electronics','compatibility_sensitive');

  -- Automotive & mobility
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'automotive','automotive-mobility','compatibility_sensitive') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Automotive & mobility',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'parts_tyres','parts-batteries-tyres-accessories','compatibility_sensitive'),(m,parent,'vehicles','vehicles-motorcycles-bicycles','vehicles');

  -- Specialist retail
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'specialist','specialist-retail','standard') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Specialist retail',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'packaging_equipment','packaging-shop-office-equipment','standard'),(m,parent,'religious_goods','religious-ceremonial-goods','standard'),
    (m,parent,'tobacco','tobacco-smoking-goods','directory_only');

  -- Books, toys & culture
  INSERT INTO categories(market_id,code,slug,commerce_mode) VALUES (m,'books_toys_culture','books-toys-culture','standard') RETURNING id INTO parent;
  INSERT INTO category_translations VALUES (parent,'en','Books, toys & culture',NULL,NULL,NULL);
  INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode) VALUES
    (m,parent,'books_stationery','books-stationery-office-supplies','standard'),(m,parent,'gifts','gifts-souvenirs-seasonal','standard'),
    (m,parent,'music_photo','music-photo-collectibles','standard'),(m,parent,'toys_games','toys-hobbies-games','standard');
END $$;

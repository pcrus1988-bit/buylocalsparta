-- Buy Local Sparta — deterministic category anchors for clean-database taxonomy migrations
BEGIN;

INSERT INTO markets(code,name)
VALUES ('sparta','Sparta')
ON CONFLICT (code) DO NOTHING;

CREATE TEMP TABLE _category_anchor_seed (
  code text PRIMARY KEY,
  parent_code text,
  commerce_mode text NOT NULL DEFAULT 'standard'
) ON COMMIT DROP;

INSERT INTO _category_anchor_seed(code,parent_code,commerce_mode) VALUES
('agriculture-pets-outdoors',NULL,'standard'),
('automotive-mobility',NULL,'standard'),
('beauty-health-retail',NULL,'standard'),
('books-toys-culture',NULL,'standard'),
('diy-building-trade',NULL,'standard'),
('fashion-personal-accessories',NULL,'standard'),
('home-furniture-garden',NULL,'standard'),
('specialist-retail',NULL,'standard'),
('technology-appliances',NULL,'standard'),
('agricultural-hand-tools','agriculture-pets-outdoors','standard'),
('agricultural-supplies-machinery','agriculture-pets-outdoors','regulated_mixed'),
('beekeeping-supplies','agriculture-pets-outdoors','standard'),
('camping-outdoor-equipment','agriculture-pets-outdoors','standard'),
('fishing-equipment','agriculture-pets-outdoors','standard'),
('greenhouse-growing-supplies','agriculture-pets-outdoors','standard'),
('hunting-fishing-outdoor-goods','agriculture-pets-outdoors','regulated_mixed'),
('irrigation-watering','agriculture-pets-outdoors','standard'),
('pet-animal-supplies','agriculture-pets-outdoors','standard'),
('automotive-parts-accessories','automotive-mobility','compatibility_sensitive'),
('bicycles-cycling','automotive-mobility','logistics_sensitive'),
('vehicles-motorcycles-bicycles','automotive-mobility','vehicles'),
('cosmetics-perfumery','beauty-health-retail','standard'),
('medical-orthopaedic-hearing','beauty-health-retail','regulated_mixed'),
('pharmacies','beauty-health-retail','directory_only'),
('books-stationery-office','books-toys-culture','standard'),
('gifts-souvenirs-seasonal','books-toys-culture','standard'),
('music-photo-collectibles','books-toys-culture','standard'),
('toys-hobbies-games','books-toys-culture','standard'),
('building-materials-timber','diy-building-trade','logistics_sensitive'),
('doors-windows-aluminium-railings','diy-building-trade','logistics_sensitive'),
('hardware-tools-paint','diy-building-trade','standard'),
('sanitary-plumbing-glazing','diy-building-trade','logistics_sensitive'),
('adult-clothing','fashion-personal-accessories','standard'),
('bags-accessories-leather','fashion-personal-accessories','standard'),
('children-baby-clothing','fashion-personal-accessories','standard'),
('footwear','fashion-personal-accessories','standard'),
('jewellery-watches','fashion-personal-accessories','standard'),
('optical-retail','fashion-personal-accessories','standard'),
('sportswear-sporting-goods','fashion-personal-accessories','standard'),
('underwear-hosiery','fashion-personal-accessories','standard'),
('beds-mattresses','home-furniture-garden','logistics_sensitive'),
('flowers-plants-garden','home-furniture-garden','standard'),
('furniture-kitchens','home-furniture-garden','logistics_sensitive'),
('heating-cooling-fireplaces','home-furniture-garden','logistics_sensitive'),
('homeware-household-goods','home-furniture-garden','standard'),
('lighting-decor','home-furniture-garden','standard'),
('textiles-linen-curtains-carpets','home-furniture-garden','standard'),
('packaging-shop-office-equipment','specialist-retail','standard'),
('religious-ceremonial-goods','specialist-retail','standard'),
('tobacco-smoking-goods','specialist-retail','directory_only'),
('cameras-photography','technology-appliances','standard'),
('computers-peripherals','technology-appliances','standard'),
('electrical-appliances','technology-appliances','standard'),
('electrical-security-business-equipment','technology-appliances','standard'),
('mobile-telecom-electronics','technology-appliances','standard'),
('tv-audio-home-entertainment','technology-appliances','standard');

INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode)
SELECT m.id,NULL,s.code,s.code,s.commerce_mode
FROM _category_anchor_seed s
JOIN markets m ON m.code='sparta'
WHERE s.parent_code IS NULL
ON CONFLICT (market_id,slug) DO NOTHING;

INSERT INTO categories(market_id,parent_id,code,slug,commerce_mode)
SELECT p.market_id,p.id,s.code,s.code,s.commerce_mode
FROM _category_anchor_seed s
JOIN categories p ON p.code=s.parent_code
WHERE s.parent_code IS NOT NULL
ON CONFLICT (market_id,slug) DO NOTHING;

COMMIT;

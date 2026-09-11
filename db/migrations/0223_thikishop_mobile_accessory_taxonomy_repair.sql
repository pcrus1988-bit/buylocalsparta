-- KONTA MOY — ThikiShop taxonomy/category repair.
-- Adds missing mobile-accessory categories, maps every active ThikiShop taxonomy node,
-- and resolves mixed supplier leaves with audited product-level category overrides.
-- This migration intentionally does not mutate append-only catalog_source_products rows.

BEGIN;

-- 1. Missing governed KONTA MOY categories required by the ThikiShop catalogue.
WITH market AS (
  SELECT id FROM public.markets WHERE code = 'sparta' LIMIT 1
), defs(code, slug, parent_code, sort_order) AS (
  VALUES
    ('tablet-cases-protection','tablet-cases-protection','mobile-accessories',60),
    ('smartwatch-accessories','smartwatch-accessories','mobile-accessories',70),
    ('phone-grips-rings','phone-grips-rings','mobile-accessories',80),
    ('phone-straps-lanyards','phone-straps-lanyards','mobile-accessories',90),
    ('stylus-pens','stylus-pens','mobile-accessories',100),
    ('other-mobile-accessories','other-mobile-accessories','mobile-accessories',110),
    ('laptop-bags-sleeves','laptop-bags-sleeves','computers-peripherals',110),
    ('smart-home-devices','smart-home-devices','electrical-security-business-equipment',110),
    ('batteries-consumer','batteries-consumer','electrical-security-business-equipment',120),
    ('audio-recorders','audio-recorders','mobile-telecom-electronics',60),
    ('gift-cards','gift-cards','gifts-souvenirs-seasonal',50)
)
INSERT INTO public.categories (
  market_id, parent_id, code, slug, commerce_mode, active, filter_schema, sort_config,
  require_compatibility_confirmation, regulated_checkout_allowed, counteroffer_allowed,
  advice_allowed, checkout_fulfilment_modes, taxonomy_role, assignable, discoverable, sort_order
)
SELECT
  m.id, p.id, d.code, d.slug, 'standard', true, '{}'::jsonb, '{}'::jsonb,
  false, false, true, true,
  ARRAY['pickup','local_delivery','shipping']::text[], 'category', true, true, d.sort_order
FROM defs d
CROSS JOIN market m
JOIN public.categories p
  ON p.market_id = m.id
 AND p.code = d.parent_code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.categories c
  WHERE c.market_id = m.id
    AND c.code = d.code
);

WITH labels(code, locale, name) AS (
  VALUES
    ('tablet-cases-protection','el','Θήκες & προστασία tablet'),
    ('tablet-cases-protection','en','Tablet cases & protection'),
    ('smartwatch-accessories','el','Αξεσουάρ smartwatch'),
    ('smartwatch-accessories','en','Smartwatch accessories'),
    ('phone-grips-rings','el','Λαβές & δαχτυλίδια κινητού'),
    ('phone-grips-rings','en','Phone grips & rings'),
    ('phone-straps-lanyards','el','Λουράκια & κορδόνια κινητού'),
    ('phone-straps-lanyards','en','Phone straps & lanyards'),
    ('stylus-pens','el','Γραφίδες αφής'),
    ('stylus-pens','en','Stylus pens'),
    ('other-mobile-accessories','el','Λοιπά αξεσουάρ κινητών'),
    ('other-mobile-accessories','en','Other mobile accessories'),
    ('laptop-bags-sleeves','el','Τσάντες & θήκες laptop'),
    ('laptop-bags-sleeves','en','Laptop bags & sleeves'),
    ('smart-home-devices','el','Έξυπνο σπίτι & IoT'),
    ('smart-home-devices','en','Smart home & IoT'),
    ('batteries-consumer','el','Μπαταρίες γενικής χρήσης'),
    ('batteries-consumer','en','Consumer batteries'),
    ('audio-recorders','el','Συσκευές ηχογράφησης'),
    ('audio-recorders','en','Audio recorders'),
    ('gift-cards','el','Δωροκάρτες'),
    ('gift-cards','en','Gift cards')
)
INSERT INTO public.category_translations(category_id, locale, name)
SELECT c.id, l.locale, l.name
FROM labels l
JOIN public.categories c
  ON c.code = l.code
 AND c.market_id = (SELECT id FROM public.markets WHERE code = 'sparta' LIMIT 1)
ON CONFLICT (category_id, locale)
DO UPDATE SET name = EXCLUDED.name;

WITH defs(category_code, product_type_code, is_default, sort_order) AS (
  VALUES
    ('tablet-cases-protection','mobile_accessory',true,0),
    ('smartwatch-accessories','mobile_accessory',true,0),
    ('phone-grips-rings','mobile_accessory',true,0),
    ('phone-straps-lanyards','mobile_accessory',true,0),
    ('stylus-pens','mobile_accessory',true,0),
    ('other-mobile-accessories','mobile_accessory',true,0),
    ('laptop-bags-sleeves','bag',true,0),
    ('laptop-bags-sleeves','computer_peripheral',false,10),
    ('smart-home-devices','consumer_electronics',true,0),
    ('smart-home-devices','security_device',false,10),
    ('batteries-consumer','electrical_supply',true,0),
    ('audio-recorders','consumer_electronics',true,0),
    ('gift-cards','gift_item',true,0)
)
INSERT INTO public.category_product_types(category_id, product_type_id, is_default, sort_order)
SELECT c.id, pt.id, d.is_default, d.sort_order
FROM defs d
JOIN public.categories c
  ON c.code = d.category_code
 AND c.market_id = (SELECT id FROM public.markets WHERE code = 'sparta' LIMIT 1)
JOIN public.product_types pt
  ON pt.code = d.product_type_code
 AND pt.status = 'active'
ON CONFLICT (category_id, product_type_id)
DO UPDATE SET
  is_default = EXCLUDED.is_default,
  sort_order = EXCLUDED.sort_order;

-- 2. Deterministic source-taxonomy mapping. Preserve any existing approved human mapping.
WITH source AS (
  SELECT id FROM public.catalog_sources WHERE code = 'thikishop-gr' LIMIT 1
), classified AS (
  SELECT
    t.id AS node_id,
    replace(replace(t.source_label, '&gt;', '>'), '&amp;', '&') AS label,
    CASE
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') LIKE 'TEMPERED GLASS%' THEN 'screen-protectors'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'Tempered OEM' THEN 'screen-protectors'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') LIKE 'ΘΗΚΕΣ TABLET%' THEN 'tablet-cases-protection'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') LIKE 'ΘΗΚΕΣ ΚΙΝΗΤΩΝ%' THEN 'phone-cases-protection'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') IN ('APPLE','HUAWEI','XIAOMI','HONOR','GKK') THEN 'phone-cases-protection'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') LIKE 'Galaxy %' THEN 'phone-cases-protection'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') IN ('Apple Watch','Samsung Watch','Xiaomi Watch') THEN 'smartwatch-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ > ΑΚΟΥΣΤΙΚΑ' THEN 'headphones-headsets'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ > USB STICKS' THEN 'computer-storage'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ > Bluetooth Speakers' THEN 'soundbars-speakers'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') LIKE 'ΑΞΕΣΟΥΑΡ > POWER BANK%' THEN 'power-banks'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ > Kickstand Rings' THEN 'phone-grips-rings'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ > Armband' THEN 'phone-mounts-holders'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ > ΑΞΕΣΟΥΑΡ LAPTOP' THEN 'computer-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ > ΒΑΣΕΙΣ ΚΙΝΗΤΩΝ' THEN 'phone-mounts-holders'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΞΕΣΟΥΑΡ' THEN 'other-mobile-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'USAMS-CATEGORY' THEN 'other-mobile-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > Smartwatches' THEN 'wearables-smartwatches'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > Smart Home Gadgets' THEN 'smart-home-devices'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > Smart Home Gadgets > Hubs & Αισθητήρες' THEN 'smart-home-devices'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > VR & Smart Toys' THEN 'educational-toys'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') LIKE 'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > Αξεσουάρ Smartwatch%' THEN 'smartwatch-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > Θήκες Laptop' THEN 'laptop-bags-sleeves'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'GADGETS' THEN 'wearables-smartwatches'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'Παιδική Διασκέδαση' THEN 'other-toys'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΔΙΑΦΟΡΑ ΑΞΕΣΟΥΑΡ > Stylus Pens - Γραφίδες Αφής' THEN 'stylus-pens'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΔΙΑΦΟΡΑ ΑΞΕΣΟΥΑΡ' THEN 'other-mobile-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'Χωρίς κατηγορία' THEN 'other-mobile-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΑΥΤΟΚΙΝΗΤΟ' THEN 'automotive-accessories'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'Δωροκάρτες' THEN 'gift-cards'
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') = 'ΠΡΟΣΦΟΡΕΣ' THEN 'batteries-consumer'
      ELSE NULL
    END AS target_code,
    CASE
      WHEN replace(replace(t.source_label,'&gt;','>'),'&amp;','&') IN (
        'ΑΞΕΣΟΥΑΡ','USAMS-CATEGORY','ΔΙΑΦΟΡΑ ΑΞΕΣΟΥΑΡ','Χωρίς κατηγορία','Tempered OEM'
      ) THEN 0.80
      ELSE 0.99
    END::numeric AS confidence
  FROM public.catalog_source_taxonomy_nodes t
  WHERE t.source_id = (SELECT id FROM source)
    AND t.active
)
INSERT INTO public.catalog_source_category_mappings(
  source_taxonomy_node_id, category_id, mapping_status, mapping_method,
  confidence, reason, reviewed_at, metadata
)
SELECT
  cl.node_id, c.id, 'approved', 'rule', cl.confidence,
  'Bulk ThikiShop taxonomy repair from supplier path semantics', now(),
  jsonb_build_object(
    'source','thikishop_bulk_taxonomy_repair',
    'source_label',cl.label,
    'target_category_code',cl.target_code
  )
FROM classified cl
JOIN public.categories c
  ON c.code = cl.target_code
 AND c.market_id = (SELECT id FROM public.markets WHERE code = 'sparta' LIMIT 1)
WHERE cl.target_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_source_category_mappings m
    WHERE m.source_taxonomy_node_id = cl.node_id
      AND m.mapping_status = 'approved'
  );

-- 3. Mixed supplier leaves cannot safely be represented by one taxonomy mapping.
-- Resolve those products individually, using the latest immutable evidence for each stable source key.
WITH source AS (
  SELECT id FROM public.catalog_sources WHERE code = 'thikishop-gr' LIMIT 1
), latest_product AS (
  SELECT DISTINCT ON (p.source_product_key)
    p.source_id,
    p.source_product_key,
    p.title,
    replace(replace(t.source_label,'&gt;','>'),'&amp;','&') AS label
  FROM public.catalog_source_products p
  JOIN public.catalog_source_taxonomy_nodes t
    ON t.id = p.source_taxonomy_node_id
  WHERE p.source_id = (SELECT id FROM source)
  ORDER BY p.source_product_key, p.created_at DESC, p.id DESC
), mixed AS (
  SELECT *
  FROM latest_product
  WHERE label IN (
    'Tempered OEM',
    'ΑΞΕΣΟΥΑΡ',
    'USAMS-CATEGORY',
    'ΔΙΑΦΟΡΑ ΑΞΕΣΟΥΑΡ',
    'Χωρίς κατηγορία',
    'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > Smart Home Gadgets'
  )
), proposed AS (
  SELECT m.*,
    CASE
      WHEN label = 'Tempered OEM' AND title ILIKE '%θήκη%' THEN 'phone-cases-protection'
      WHEN label = 'Tempered OEM' THEN 'screen-protectors'
      WHEN label = 'Χωρίς κατηγορία' AND title ILIKE '%smartwatch%' THEN 'wearables-smartwatches'
      WHEN label = 'Χωρίς κατηγορία' AND (title ILIKE '%μπαταρ%' OR title ILIKE '%battery%') THEN 'batteries-consumer'

      WHEN title ILIKE '%usb stick%' OR title ILIKE '%flash drive%' OR title ILIKE '%memory card%'
        OR title ILIKE '%microsd%' OR title ILIKE '%sdhc%' OR title ILIKE '%sdxc%' THEN 'computer-storage'
      WHEN title ILIKE '%laptop%' AND (
        title ILIKE '%cooling%' OR title ILIKE '%stand%' OR title ILIKE '%holder%' OR title ILIKE '%βάση%'
      ) THEN 'computer-accessories'
      WHEN title ILIKE '%power bank%' THEN 'power-banks'
      WHEN title ILIKE '%ακουστικ%' OR title ILIKE '%headphone%' OR title ILIKE '%earbud%' THEN 'headphones-headsets'
      WHEN (title ILIKE '%watch%' OR title ILIKE '%smart band%' OR title ILIKE '%mi band%')
        AND (title ILIKE '%λουράκι%' OR title ILIKE '%strap%' OR title ILIKE '%band%') THEN 'smartwatch-accessories'
      WHEN title ILIKE '%λουράκι λαιμού%' OR title ILIKE '%lanyard%' THEN 'phone-straps-lanyards'
      WHEN title ILIKE '%δεματικ%' OR (title ILIKE '%velcro%' AND title ILIKE '%strap%') THEN 'other-mobile-accessories'
      WHEN title ILIKE '%kickstand%' OR title ILIKE '%ring holder%' OR title ILIKE '%δαχτυλ%'
        OR title ILIKE '%στήριξη κινητού%' OR title ILIKE '%βεντουζ%' THEN 'phone-grips-rings'
      WHEN title ILIKE '%βάση%' OR title ILIKE '%mount%' OR title ILIKE '%phone holder%' OR title ILIKE '%car holder%' THEN 'phone-mounts-holders'
      WHEN title ILIKE '%φορτιστ%' OR title ILIKE '%charger%' OR title ILIKE '%καλώδιο%' OR title ILIKE '%cable%'
        OR title ILIKE '%adapter%' OR title ILIKE '%adaptor%' THEN 'chargers-cables'
      WHEN title ILIKE '%powercube%' OR title ILIKE '%πολύπριζ%' THEN 'electrical-installation-supplies'
      WHEN title ILIKE '%θήκη%' AND (
        title ILIKE '%laptop%' OR title ILIKE '%computer sleeve%' OR title ILIKE '%computer bag%'
      ) THEN 'laptop-bags-sleeves'
      WHEN title ILIKE '%θήκη%' AND (title ILIKE '%tablet%' OR title ILIKE '%ipad%') THEN 'tablet-cases-protection'
      WHEN title ILIKE '%θήκη%' AND title ILIKE '%vr%' THEN 'other-mobile-accessories'
      WHEN title ILIKE '%θήκη%' THEN 'phone-cases-protection'
      WHEN title ILIKE '%tempered%' OR title ILIKE '%screen protector%' OR title ILIKE '%προστασία οθόνης%' THEN 'screen-protectors'
      WHEN title ILIKE '%speaker%' OR title ILIKE '%ηχεί%' THEN 'soundbars-speakers'
      WHEN title ILIKE '%doorbell%' OR title ILIKE '%smart bulb%' OR title ILIKE '%smart wi-fi%' OR title ILIKE '%smart hub%'
        OR title ILIKE '%sensor%' OR title ILIKE '%αισθητήρ%' OR title ILIKE '%smart socket%' OR title ILIKE '%gps tracker%'
        OR title ILIKE '%τηλεχειριστήριο%' OR title ILIKE '%τηλεχειριστηρίου%' THEN 'smart-home-devices'
      WHEN title ILIKE '%ηχογράφ%' OR title ILIKE '%voice recorder%' OR title ILIKE '%καταγραφικό φωνής%' THEN 'audio-recorders'
      WHEN title ILIKE '%camera%' OR title ILIKE '%κάμερα%' THEN 'digital-cameras'
      WHEN title ILIKE '%ανεμιστήρ%' OR title ILIKE '%handheld fan%' THEN 'fans-air-circulation'
      WHEN title ILIKE '%μπαταρ%' OR title ILIKE '%battery%' THEN 'batteries-consumer'
      ELSE CASE
        WHEN label = 'ΤΕΧΝΟΛΟΓΙΑ & GADGETS > Smart Home Gadgets' THEN 'smart-home-devices'
        ELSE 'other-mobile-accessories'
      END
    END AS target_code
  FROM mixed m
)
INSERT INTO public.catalog_source_product_category_overrides(
  source_id, source_product_key, category_id, override_status,
  confidence, reason_code, evidence, reviewed_at
)
SELECT
  p.source_id, p.source_product_key, c.id, 'approved', 0.98, 'mixed_source_leaf',
  jsonb_build_object(
    'source','thikishop_bulk_taxonomy_repair',
    'source_label',p.label,
    'title',p.title,
    'target_category_code',p.target_code
  ),
  now()
FROM proposed p
JOIN public.categories c
  ON c.code = p.target_code
 AND c.market_id = (SELECT id FROM public.markets WHERE code = 'sparta' LIMIT 1)
ON CONFLICT (source_id, source_product_key)
DO UPDATE SET
  category_id = EXCLUDED.category_id,
  override_status = 'approved',
  confidence = EXCLUDED.confidence,
  reason_code = EXCLUDED.reason_code,
  evidence = EXCLUDED.evidence,
  reviewed_at = EXCLUDED.reviewed_at,
  updated_at = now()
WHERE public.catalog_source_product_category_overrides.override_status <> 'approved'
   OR public.catalog_source_product_category_overrides.reason_code = 'mixed_source_leaf'
   OR public.catalog_source_product_category_overrides.evidence ->> 'source' = 'thikishop_bulk_taxonomy_repair';

COMMIT;

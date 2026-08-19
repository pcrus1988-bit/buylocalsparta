BEGIN;

-- Pre-seed a broad brand dictionary for future catalogue ingestion. Storefront
-- visibility remains product/availability-backed, so unused brands stay hidden.
CREATE TEMP TABLE _brand_seed(name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _brand_seed VALUES
('Apple'),('Samsung'),('Xiaomi'),('Huawei'),('Motorola'),('Nokia'),('Lenovo'),('HP'),('Dell'),('ASUS'),('Acer'),('Logitech'),('TP-Link'),('Canon'),('Nikon'),('Sony'),('LG'),('Philips'),('Bosch'),('Siemens'),('Whirlpool'),('Beko'),('Miele'),('Tefal'),('Rowenta'),('Braun'),('De''Longhi'),('Kärcher'),('JBL'),('Anker'),('Kingston'),('SanDisk'),('Western Digital'),('Epson'),('Brother'),('Makita'),('DeWalt'),('Stanley'),('BLACK+DECKER'),('Einhell'),('Knipex'),('Wera'),('Grohe'),('Ideal Standard'),('adidas'),('Nike'),('Puma'),('Levi''s'),('Jack & Jones'),('Vero Moda'),('Tommy Hilfiger'),('Calvin Klein'),('Skechers'),('New Balance'),('Vans'),('Converse'),('Ray-Ban'),('Oakley'),('Polaroid'),('Casio'),('Seiko'),('Citizen'),('Fossil'),('LEGO'),('Playmobil'),('Mattel'),('Hasbro'),('Ravensburger'),('Clementoni'),('Faber-Castell'),('STABILO'),('Pilot'),('BIC'),('Maped'),('Staedtler'),('Moleskine'),('Clairefontaine'),('L''Oréal Paris'),('Maybelline New York'),('Garnier'),('NIVEA'),('CeraVe'),('La Roche-Posay'),('Vichy'),('KORRES'),('APIVITA'),('Michelin'),('Continental'),('Bridgestone'),('Pirelli'),('Castrol'),('Motul'),('VARTA'),('Exide'),('Shimano'),('Daiwa'),('Rapala'),('Coleman'),('Salomon'),('Brabantia'),('Pyrex'),('Vileda'),('Trixie'),('Ferplast');

INSERT INTO brands(name,normalized_name,status,updated_at)
SELECT s.name,bls_private.normalize_catalog_alias(s.name),'active',now()
FROM _brand_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM brands b
  WHERE b.normalized_name=bls_private.normalize_catalog_alias(s.name)
);

UPDATE brands b
SET status='active',updated_at=now()
FROM _brand_seed s
WHERE b.normalized_name=bls_private.normalize_catalog_alias(s.name)
  AND b.status<>'active';

INSERT INTO brand_aliases(brand_id,source_namespace,alias,normalized_alias,active)
SELECT b.id,'catalog',b.name,bls_private.normalize_catalog_alias(b.name),true
FROM brands b
WHERE b.status='active'
  AND NOT EXISTS (
    SELECT 1 FROM brand_aliases a
    WHERE a.brand_id=b.id
      AND a.source_namespace='catalog'
      AND a.normalized_alias=bls_private.normalize_catalog_alias(b.name)
      AND a.active=true
  );

INSERT INTO product_family_attribute_values(family_id,attribute_id,position,text_value,source,confidence,updated_at)
SELECT pf.id,ad.id,0,cv.variant_attributes->>'author','migration',1.00000,now()
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id AND pt.code='book'
JOIN attribute_definitions ad ON ad.code='author'
WHERE nullif(btrim(cv.variant_attributes->>'author'),'') IS NOT NULL
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET text_value=EXCLUDED.text_value,attribute_value_id=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,source='migration',confidence=1.00000,updated_at=now();

INSERT INTO product_family_attribute_values(family_id,attribute_id,position,text_value,source,confidence,updated_at)
SELECT pf.id,ad.id,0,cv.variant_attributes->>'publisher','migration',1.00000,now()
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id AND pt.code='book'
JOIN attribute_definitions ad ON ad.code='publisher'
WHERE nullif(btrim(cv.variant_attributes->>'publisher'),'') IS NOT NULL
ON CONFLICT (family_id,attribute_id,position) DO UPDATE SET text_value=EXCLUDED.text_value,attribute_value_id=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,source='migration',confidence=1.00000,updated_at=now();

INSERT INTO canonical_variant_attribute_values(canonical_variant_id,attribute_id,position,number_value,source,confidence,updated_at)
SELECT cv.id,ad.id,0,(cv.variant_attributes->>'pages')::numeric,'migration',1.00000,now()
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id AND pt.code='book'
JOIN attribute_definitions ad ON ad.code='page_count'
WHERE (cv.variant_attributes->>'pages') ~ '^[0-9]+([.][0-9]+)?$'
ON CONFLICT (canonical_variant_id,attribute_id,position) DO UPDATE SET number_value=EXCLUDED.number_value,attribute_value_id=NULL,text_value=NULL,boolean_value=NULL,dimension_value=NULL,source='migration',confidence=1.00000,updated_at=now();

INSERT INTO canonical_variant_attribute_values(canonical_variant_id,attribute_id,position,attribute_value_id,source,confidence,updated_at)
SELECT cv.id,ad.id,0,av.id,'migration',1.00000,now()
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id AND pt.code='book'
JOIN attribute_definitions ad ON ad.code='language'
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=CASE
  WHEN lower(cv.variant_attributes->>'language') IN ('english','en','αγγλικά') THEN 'en'
  WHEN lower(cv.variant_attributes->>'language') IN ('greek','el','ελληνικά') THEN 'el'
  WHEN lower(cv.variant_attributes->>'language') IN ('french','fr','γαλλικά') THEN 'fr'
  WHEN lower(cv.variant_attributes->>'language') IN ('german','de','γερμανικά') THEN 'de'
  WHEN lower(cv.variant_attributes->>'language') IN ('italian','it','ιταλικά') THEN 'it'
  WHEN lower(cv.variant_attributes->>'language') IN ('spanish','es','ισπανικά') THEN 'es'
  ELSE 'other' END
WHERE nullif(btrim(cv.variant_attributes->>'language'),'') IS NOT NULL
ON CONFLICT (canonical_variant_id,attribute_id,position) DO UPDATE SET attribute_value_id=EXCLUDED.attribute_value_id,text_value=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,source='migration',confidence=1.00000,updated_at=now();

INSERT INTO canonical_variant_attribute_values(canonical_variant_id,attribute_id,position,attribute_value_id,source,confidence,updated_at)
SELECT cv.id,ad.id,0,av.id,'migration',1.00000,now()
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id AND pt.code='book'
JOIN attribute_definitions ad ON ad.code='publication_format'
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=CASE
  WHEN lower(cv.variant_attributes->>'format') IN ('paperback','softcover','soft cover') THEN 'paperback'
  WHEN lower(cv.variant_attributes->>'format') IN ('hardcover','hardback','hard cover') THEN 'hardcover'
  WHEN lower(cv.variant_attributes->>'format') IN ('board book','board-book') THEN 'board-book'
  ELSE 'other' END
WHERE nullif(btrim(cv.variant_attributes->>'format'),'') IS NOT NULL
ON CONFLICT (canonical_variant_id,attribute_id,position) DO UPDATE SET attribute_value_id=EXCLUDED.attribute_value_id,text_value=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,source='migration',confidence=1.00000,updated_at=now();

INSERT INTO canonical_variant_attribute_values(canonical_variant_id,attribute_id,position,text_value,source,confidence,updated_at)
SELECT cv.id,ad.id,0,cv.variant_attributes->>'color','migration',1.00000,now()
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id AND pt.code IN ('apparel','dress','shirt','top','footwear','running_shoe')
JOIN attribute_definitions ad ON ad.code='manufacturer_colour'
WHERE nullif(btrim(cv.variant_attributes->>'color'),'') IS NOT NULL
ON CONFLICT (canonical_variant_id,attribute_id,position) DO UPDATE SET text_value=EXCLUDED.text_value,attribute_value_id=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,source='migration',confidence=1.00000,updated_at=now();

INSERT INTO canonical_variant_attribute_values(canonical_variant_id,attribute_id,position,attribute_value_id,source,confidence,updated_at)
SELECT cv.id,ad.id,0,av.id,'migration',0.95000,now()
FROM canonical_variants cv
JOIN product_families pf ON pf.id=cv.family_id
JOIN product_types pt ON pt.id=pf.product_type_id AND pt.code IN ('apparel','dress','shirt','top','footwear','running_shoe')
JOIN attribute_definitions ad ON ad.code='colour'
JOIN attribute_values av ON av.attribute_id=ad.id AND av.code=CASE
  WHEN upper(cv.variant_attributes->>'color') LIKE '%ΠΟΛΥΧΡ%' OR upper(cv.variant_attributes->>'color') LIKE '%MULTI%' THEN 'multicolour'
  WHEN upper(cv.variant_attributes->>'color') LIKE '%ΛΙΛ%' OR upper(cv.variant_attributes->>'color') LIKE '%LILAC%' THEN 'lilac'
  WHEN upper(cv.variant_attributes->>'color') LIKE '%ΡΟΖ%' OR upper(cv.variant_attributes->>'color') LIKE '%PINK%' OR upper(cv.variant_attributes->>'color') LIKE '%SANGRIA%' THEN 'pink'
  WHEN upper(cv.variant_attributes->>'color') LIKE '%PUMICE%' THEN 'beige'
  ELSE NULL END
WHERE nullif(btrim(cv.variant_attributes->>'color'),'') IS NOT NULL AND av.code IS NOT NULL
ON CONFLICT (canonical_variant_id,attribute_id,position) DO UPDATE SET attribute_value_id=EXCLUDED.attribute_value_id,text_value=NULL,number_value=NULL,boolean_value=NULL,dimension_value=NULL,source='migration',confidence=EXCLUDED.confidence,updated_at=now();

COMMIT;

-- Build 0.20: category-governed attributes and progressive commerce gates.
-- Category policy remains data-driven so regulated/compatibility-sensitive classes can be activated deliberately.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS require_compatibility_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regulated_checkout_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counteroffer_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS advice_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS checkout_fulfilment_modes text[] NOT NULL DEFAULT ARRAY['pickup','local_delivery','shipping']::text[];

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_checkout_modes_check;
ALTER TABLE categories ADD CONSTRAINT categories_checkout_modes_check CHECK (
  checkout_fulfilment_modes <@ ARRAY['pickup','local_delivery','shipping']::text[]
);

CREATE TABLE IF NOT EXISTS attribute_translations (
  attribute_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  locale text NOT NULL,
  label text NOT NULL,
  help_text text,
  PRIMARY KEY(attribute_id, locale)
);

CREATE INDEX IF NOT EXISTS category_attributes_sort_idx ON category_attributes(category_id, sort_order, attribute_id);

-- Compatibility-sensitive categories require explicit customer confirmation unless a later category rule disables it.
UPDATE categories SET require_compatibility_confirmation=true WHERE commerce_mode='compatibility_sensitive';
UPDATE categories SET counteroffer_allowed=false WHERE commerce_mode='directory_only';

INSERT INTO attribute_definitions(code,data_type,unit,variant_identity,filterable,values)
VALUES
  ('colour','enum',NULL,true,true,'["white","black","brass","blue","red"]'::jsonb),
  ('connector','enum',NULL,true,true,'["USB-C","Lightning","Bluetooth","Other"]'::jsonb),
  ('wireless','boolean',NULL,false,true,'[]'::jsonb),
  ('material','enum',NULL,false,true,'["metal","wood","plastic","paper"]'::jsonb),
  ('size','enum',NULL,true,true,'["A4","A5","A6"]'::jsonb),
  ('cover','enum',NULL,false,true,'["hard","soft"]'::jsonb)
ON CONFLICT(code) DO NOTHING;

INSERT INTO attribute_translations(attribute_id,locale,label)
SELECT id,'el',CASE code
  WHEN 'colour' THEN 'Χρώμα' WHEN 'connector' THEN 'Σύνδεση' WHEN 'wireless' THEN 'Ασύρματο'
  WHEN 'material' THEN 'Υλικό' WHEN 'size' THEN 'Μέγεθος' WHEN 'cover' THEN 'Εξώφυλλο' END
FROM attribute_definitions WHERE code IN ('colour','connector','wireless','material','size','cover')
ON CONFLICT(attribute_id,locale) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO attribute_translations(attribute_id,locale,label)
SELECT id,'en',CASE code
  WHEN 'colour' THEN 'Colour' WHEN 'connector' THEN 'Connector' WHEN 'wireless' THEN 'Wireless'
  WHEN 'material' THEN 'Material' WHEN 'size' THEN 'Size' WHEN 'cover' THEN 'Cover' END
FROM attribute_definitions WHERE code IN ('colour','connector','wireless','material','size','cover')
ON CONFLICT(attribute_id,locale) DO UPDATE SET label=EXCLUDED.label;

-- Bind filters/identity fields to representative pilot subcategories.
INSERT INTO category_attributes(category_id,attribute_id,required,sort_order)
SELECT c.id,a.id,(a.code IN ('colour','connector')),CASE a.code WHEN 'colour' THEN 10 WHEN 'connector' THEN 20 ELSE 30 END
FROM categories c CROSS JOIN attribute_definitions a
WHERE c.slug='mobile-telecom-electronics' AND a.code IN ('colour','connector','wireless')
ON CONFLICT(category_id,attribute_id) DO UPDATE SET required=EXCLUDED.required,sort_order=EXCLUDED.sort_order;

INSERT INTO category_attributes(category_id,attribute_id,required,sort_order)
SELECT c.id,a.id,false,CASE a.code WHEN 'colour' THEN 10 ELSE 20 END
FROM categories c CROSS JOIN attribute_definitions a
WHERE c.slug='lighting-decor' AND a.code IN ('colour','material')
ON CONFLICT(category_id,attribute_id) DO UPDATE SET required=EXCLUDED.required,sort_order=EXCLUDED.sort_order;

INSERT INTO category_attributes(category_id,attribute_id,required,sort_order)
SELECT c.id,a.id,false,CASE a.code WHEN 'size' THEN 10 ELSE 20 END
FROM categories c CROSS JOIN attribute_definitions a
WHERE c.slug='books-stationery-office-supplies' AND a.code IN ('size','cover')
ON CONFLICT(category_id,attribute_id) DO UPDATE SET required=EXCLUDED.required,sort_order=EXCLUDED.sort_order;

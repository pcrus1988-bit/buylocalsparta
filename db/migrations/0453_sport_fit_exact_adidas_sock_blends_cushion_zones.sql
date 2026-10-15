
-- KONTA MOY Sport & Fit 0453: exact adidas sock composition and protected-zone evidence.
-- Does not infer cushioning intensity, moisture-wicking, exercise protection
-- or footwear sizes from manufacturer composition. Canonical family only.
BEGIN;
INSERT INTO public.attribute_definitions
(code,data_type,value_mode,group_code,filterable,variant_identity,active)
VALUES
('sock_cushion_zone','multienum','controlled','sport_socks',true,false,true),
('sock_cotton_pct','number','free','sport_socks',false,false,true),
('sock_polyester_pct','number','free','sport_socks',false,false,true),
('sock_elastane_pct','number','free','sport_socks',false,false,true),
('sock_nylon_pct','number','free','sport_socks',false,false,true)
ON CONFLICT(code) DO UPDATE SET group_code=EXCLUDED.group_code,
data_type=EXCLUDED.data_type,value_mode=EXCLUDED.value_mode,
filterable=EXCLUDED.filterable,active=true,updated_at=now();

INSERT INTO public.attribute_translations(attribute_id,locale,label,help_text)
SELECT ad.id,x.locale,x.label,x.help_text
FROM public.attribute_definitions ad
JOIN (VALUES
('sock_cushion_zone'::text,'en'::text,'Sock cushioning location'::text,'Manufacturer-documented padding location only. Does not imply intensity.'::text),
('sock_cushion_zone','el','Θέση ενίσχυσης κάλτσας','Πού υπάρχει τεκμηριωμένη ενίσχυση. Δεν δηλώνει ένταση απορρόφησης.'),
('sock_cotton_pct','en','Cotton (%)','Verified exact-model blend, percentage.'),
('sock_cotton_pct','el','Βαμβάκι (%)','Επιβεβαιωμένη σύνθεση ακριβούς μοντέλου.'),
('sock_polyester_pct','en','Polyester (%)','Verified exact-model blend, percentage; may be recycled.'),
('sock_polyester_pct','el','Πολυεστέρας (%)','Επιβεβαιωμένη σύνθεση ακριβούς μοντέλου.'),
('sock_elastane_pct','en','Elastane (%)','Verified exact-model blend, percentage.'),
('sock_elastane_pct','el','Ελαστάνη (%)','Επιβεβαιωμένη σύνθεση ακριβούς μοντέλου.'),
('sock_nylon_pct','en','Nylon (%)','Verified exact-model blend, percentage.'),
('sock_nylon_pct','el','Νάιλον (%)','Επιβεβαιωμένη σύνθεση ακριβούς μοντέλου.')
) x(code,locale,label,help_text) ON x.code=ad.code
ON CONFLICT(attribute_id,locale) DO UPDATE SET label=EXCLUDED.label,help_text=EXCLUDED.help_text;

INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,x.code,x.sort_order,x.metadata
FROM public.attribute_definitions ad
JOIN (VALUES
('sock_cushion_zone'::text,'heel'::text,10,'{"technicalMeaning":"explicit manufacturer heel cushioning, level unknown"}'::jsonb),
('sock_cushion_zone','toe',20,'{"technicalMeaning":"explicit manufacturer toe cushioning, level unknown"}'::jsonb)
) x(attribute_code,code,sort_order,metadata) ON x.attribute_code=ad.code
ON CONFLICT(attribute_id,code) DO UPDATE SET active=true,sort_order=EXCLUDED.sort_order,
metadata=EXCLUDED.metadata,updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,x.locale,x.label
FROM public.attribute_definitions ad JOIN public.attribute_values av ON av.attribute_id=ad.id
JOIN (VALUES
('sock_cushion_zone'::text,'heel'::text,'en'::text,'Heel'::text),
('sock_cushion_zone','heel','el','Φτέρνα'),
('sock_cushion_zone','toe','en','Toe'),
('sock_cushion_zone','toe','el','Δάχτυλα')
) x(attribute_code,value_code,locale,label) ON ad.code=x.attribute_code AND av.code=x.value_code
ON CONFLICT(attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

-- Family-level optional dimensions on the already existing apparel type.
INSERT INTO public.product_type_attributes
(product_type_id,attribute_id,requirement_level,value_level,
 filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order)
SELECT pt.id,ad.id,'optional','family',ad.code='sock_cushion_zone',false,true,true,false,
  ad.code='sock_cushion_zone',500+row_number() OVER (ORDER BY ad.code)
FROM public.product_types pt JOIN public.attribute_definitions ad
ON ad.code IN('sock_cushion_zone','sock_cotton_pct','sock_polyester_pct','sock_elastane_pct','sock_nylon_pct')
WHERE pt.code='apparel'
ON CONFLICT(product_type_id,attribute_id) DO UPDATE SET
 value_level='family',customer_visible=true,comparable=true,
 allow_multiple=EXCLUDED.allow_multiple,updated_at=now();

-- The shared packaging attribute is already controlled by the catalog schema,
-- but was not registered for apparel. Register it before inserting family data.
INSERT INTO public.product_type_attributes
(product_type_id,attribute_id,requirement_level,value_level,
 filterable,searchable,customer_visible,comparable,variant_defining,allow_multiple,sort_order)
SELECT pt.id,ad.id,'optional','family',false,false,true,true,false,false,550
FROM public.product_types pt JOIN public.attribute_definitions ad ON ad.code='pack_quantity'
WHERE pt.code='apparel'
ON CONFLICT(product_type_id,attribute_id) DO UPDATE SET
 requirement_level='optional',value_level='family',
 customer_visible=true,comparable=true,updated_at=now();

CREATE TEMP TABLE _s453_scope(enforce_data boolean NOT NULL) ON COMMIT DROP;
INSERT INTO _s453_scope
SELECT EXISTS(SELECT 1 FROM public.canonical_variants WHERE active AND NOT suppressed AND NOT recalled);

CREATE TEMP TABLE _s453_models(
 code text PRIMARY KEY,family_id uuid NOT NULL UNIQUE,url text NOT NULL,
 title text NOT NULL,height text NOT NULL,
 cotton int NOT NULL,polyester int NOT NULL,elastane int NOT NULL,nylon int NOT NULL,
 activity text
) ON COMMIT DROP;
INSERT INTO _s453_models VALUES
('HT3437','2336593f-b85f-447e-8278-0d3968bc48e3','https://www.adidas.co.th/en/3-stripes-linear-half-crew-cushioned-socks-3-pairs/HT3437.html','adidas 3-Stripes Linear Half-Crew Cushioned Socks 3 Pairs · HT3437','quarter',71,26,2,1,NULL),
('IC1305','3809ac6e-e8ed-4465-bb62-0ee23fa8ca6f','https://www.adidas.com/qa/en/think-linear-ankle-socks-3-pairs/IC1305.html','adidas Think Linear Ankle Socks 3 Pairs · IC1305','ankle',68,29,2,1,NULL),
('IZ0106','83d8ca67-61fd-413f-bdef-b0b64576a507','https://www.adidas.de/en/linear-crew-cushioned-socks-3-pairs/IZ0106.html','adidas Linear Crew Cushioned Socks 3 Pairs · IZ0106','crew',75,22,2,1,'general_training'),
('HT3457','cb6d72b5-8835-4f58-8fe9-070dd9991426','https://www.adidas.ie/linear-ankle-cushioned-socks-3-pairs/HT3457.html','adidas Linear Ankle Cushioned Socks 3 Pairs · HT3457','ankle',71,26,2,1,'gym_training');

DO $$
DECLARE r record; n int;
BEGIN
 FOR r IN SELECT * FROM _s453_models LOOP
  IF r.cotton+r.polyester+r.elastane+r.nylon<>100 THEN
   RAISE EXCEPTION '0453 invalid blend sum %',r.code; END IF;
 END LOOP;
 IF NOT (SELECT enforce_data FROM _s453_scope) THEN RETURN; END IF;
 FOR r IN SELECT * FROM _s453_models LOOP
  SELECT count(*) INTO n FROM public.product_families pf
  WHERE pf.id=r.family_id AND pf.active AND EXISTS(
   SELECT 1 FROM public.canonical_variants cv JOIN public.categories c ON c.id=cv.category_id
   WHERE cv.family_id=pf.id AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
   AND c.code='socks-hosiery'
   AND lower(cv.slug) ~ ('(^|-)'||lower(r.code)||'(-|$)')
  );
  IF n<>1 THEN RAISE EXCEPTION '0453 exact sock model identity drift %',r.code; END IF;
  SELECT count(*) INTO n
  FROM public.vendor_offers vo JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
  WHERE cv.family_id=r.family_id AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
    AND vo.status::text='approved' AND coalesce(vo.merchant_visible,true)
    AND NOT coalesce(vo.merchant_pause_active,false);
  IF n=0 THEN RAISE EXCEPTION '0453 no visible offers for %',r.code; END IF;
 END LOOP;
END $$;

INSERT INTO public.sport_knowledge_sources
(source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active)
SELECT 'adidas_sock_exact_'||lower(code)||'_20261015','manufacturer_product',
 'adidas',title,url,'2026-10-15'::timestamptz,'current',
 jsonb_build_object('productCode',code,'scope','exact model product details','retrievedOn','2026-10-15',
 'materialsPctBasis','manufacturer published blend', 'unknownsRemainUnset',
 jsonb_build_array('sock_cushioning','moisture_wicking','compression_level','sports_without_explicit_manufacturer_support')),true
FROM _s453_models
ON CONFLICT(source_key) DO UPDATE SET url=EXCLUDED.url,title=EXCLUDED.title,
metadata=EXCLUDED.metadata,updated_at=now(),active=true,source_status='current';

CREATE TEMP TABLE _s453_facts(
 code text,attribute_code text,position int,value_code text,number_value numeric,
 evidence_excerpt text, PRIMARY KEY(code,attribute_code,position)
) ON COMMIT DROP;
INSERT INTO _s453_facts
SELECT code,'sock_height',0,height,NULL,'Exact adidas '||code||' details specify '||height||' sock length.'
FROM _s453_models
UNION ALL SELECT code,'pack_quantity',0,NULL,3,'Exact adidas '||code||' details specify three pairs per pack.'
FROM _s453_models
UNION ALL SELECT code,'sock_cotton_pct',0,NULL,cotton,'Exact adidas '||code||' composition: '||cotton||'% cotton.'
FROM _s453_models
UNION ALL SELECT code,'sock_polyester_pct',0,NULL,polyester,'Exact adidas '||code||' composition: '||polyester||'% recycled polyester.'
FROM _s453_models
UNION ALL SELECT code,'sock_elastane_pct',0,NULL,elastane,'Exact adidas '||code||' composition: '||elastane||'% elastane.'
FROM _s453_models
UNION ALL SELECT code,'sock_nylon_pct',0,NULL,nylon,'Exact adidas '||code||' composition: '||nylon||'% recycled nylon.'
FROM _s453_models
UNION ALL SELECT code,'sport_activity',0,activity,NULL,
 'Exact adidas '||code||' manufacturer copy directly places the sock in a '||
 CASE WHEN activity='gym_training' THEN 'gym-use' ELSE 'workout/general training' END||' context.'
FROM _s453_models WHERE activity IS NOT NULL
UNION ALL SELECT code,'sock_cushion_zone',0,'heel',NULL,
 'Exact adidas '||code||' manufacturer product details explicitly say sole cushioning at the heel.'
FROM _s453_models WHERE code IN ('HT3437','HT3457','IZ0106')
UNION ALL SELECT code,'sock_cushion_zone',1,'toe',NULL,
 'Exact adidas '||code||' manufacturer product details explicitly say sole cushioning at the toe.'
FROM _s453_models WHERE code IN ('HT3437','HT3457','IZ0106');

DO $$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM _s453_facts;
 IF n<>32 THEN RAISE EXCEPTION '0453 unexpected curated fact count %',n; END IF;
 IF NOT (SELECT enforce_data FROM _s453_scope) THEN RETURN; END IF;
 SELECT count(*) INTO n FROM _s453_facts seed JOIN _s453_models m USING(code)
 JOIN public.attribute_definitions ad ON ad.code=seed.attribute_code AND ad.active
 LEFT JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=seed.value_code AND av.active
 WHERE (seed.value_code IS NULL AND ad.data_type='number')
    OR (seed.value_code IS NOT NULL AND av.id IS NOT NULL AND ad.data_type IN('enum','multienum'));
 IF n<>32 THEN RAISE EXCEPTION '0453 controlled/numeric fact validation failed %',n; END IF;
 SELECT count(*) INTO n FROM _s453_facts seed JOIN _s453_models m USING(code)
 JOIN public.attribute_definitions ad ON ad.code=seed.attribute_code
 JOIN public.product_family_attribute_values f ON f.family_id=m.family_id
    AND f.attribute_id=ad.id AND f.position=seed.position;
 IF n>0 THEN RAISE EXCEPTION '0453 target family facts already exist %',n; END IF;
END $$;

INSERT INTO public.product_family_attribute_values
(family_id,attribute_id,position,attribute_value_id,number_value,source,confidence)
SELECT m.family_id,ad.id,f.position,av.id,f.number_value,'enrichment',1.0
FROM _s453_facts f JOIN _s453_models m USING(code)
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
LEFT JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code
WHERE (SELECT enforce_data FROM _s453_scope);

INSERT INTO public.sport_product_fact_evidence
(family_id,attribute_id,position,source_id,evidence_strength,
 extraction_method,evidence_value,evidence_excerpt,source_locator,
 confidence,identity_confidence)
SELECT m.family_id,ad.id,f.position,s.id,'manufacturer_claim','page_text',
 CASE WHEN f.value_code IS NOT NULL THEN to_jsonb(f.value_code)
      ELSE to_jsonb(f.number_value) END,
 f.evidence_excerpt,'Exact adidas manufacturer product page, code '||f.code,
 1.0,1.0
FROM _s453_facts f JOIN _s453_models m USING(code)
JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s
 ON s.source_key='adidas_sock_exact_'||lower(f.code)||'_20261015'
WHERE (SELECT enforce_data FROM _s453_scope);

DO $$
DECLARE m record;n int;
BEGIN
 IF NOT (SELECT enforce_data FROM _s453_scope) THEN RETURN; END IF;
 FOR m IN SELECT family_id FROM _s453_models LOOP
  PERFORM bls_private.refresh_sport_product_knowledge(m.family_id);
 END LOOP;
 SELECT count(*) INTO n FROM _s453_facts f JOIN _s453_models m USING(code)
 JOIN public.sport_product_fact_evidence e ON e.family_id=m.family_id AND e.position=f.position
 JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code=f.attribute_code
 WHERE e.active;
 IF n<>32 THEN RAISE EXCEPTION '0453 expected 32 linked active evidence rows, got %',n; END IF;
 SELECT count(*) INTO n FROM _s453_models m JOIN public.sport_product_knowledge k ON k.family_id=m.family_id
 WHERE k.knowledge_status='conflict' OR k.conflict_count>0;
 IF n>0 THEN RAISE EXCEPTION '0453 introduces knowledge conflicts %',n; END IF;
END $$;
COMMIT;

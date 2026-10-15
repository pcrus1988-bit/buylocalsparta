-- KONTA MOY Sport & Fit 0451 — exact adidas SL2 + Anylander enrichment
-- First-party exact-style evidence only. Named technologies are not support,
-- cushioning-intensity or medical claims; "Regular fit" is NOT standard width.
-- The existing canonical family → variants → vendor offers schema is retained.
BEGIN;
INSERT INTO public.attribute_values(attribute_id,code,sort_order,metadata)
SELECT ad.id,x.code,x.sort_order,x.metadata
FROM public.attribute_definitions ad
JOIN (VALUES
 ('footwear_technology'::text,'lightstrike_pro'::text,110,'{"brand":"adidas","technicalFact":true,"doesNotImplyCushioningIntensity":true}'::jsonb),
 ('footwear_technology','traxion',120,'{"brand":"adidas","component":"outsole","technicalFact":true,"doesNotImplyUniversalSurfaceCompatibility":true}'::jsonb),
 ('footwear_technology','rain_rdy',130,'{"brand":"adidas","technologyFamily":"weather","technicalFact":true,"doesNotImplyWaterproofCertification":true}'::jsonb)
) x(attribute_code,code,sort_order,metadata) ON x.attribute_code=ad.code AND ad.active
ON CONFLICT(attribute_id,code) DO UPDATE SET
 metadata=EXCLUDED.metadata,active=true,sort_order=EXCLUDED.sort_order,updated_at=now();

INSERT INTO public.attribute_value_translations(attribute_value_id,locale,label)
SELECT av.id,x.locale,x.label
FROM public.attribute_definitions ad
JOIN public.attribute_values av ON av.attribute_id=ad.id
JOIN (VALUES
 ('footwear_technology'::text,'lightstrike_pro'::text,'en'::text,'Lightstrike Pro'::text),
 ('footwear_technology','lightstrike_pro','el','Lightstrike Pro'),
 ('footwear_technology','traxion','en','Traxion'),
 ('footwear_technology','traxion','el','Traxion'),
 ('footwear_technology','rain_rdy','en','RAIN.RDY'),
 ('footwear_technology','rain_rdy','el','RAIN.RDY')
) x(attribute_code,value_code,locale,label)
ON x.attribute_code=ad.code AND x.value_code=av.code
ON CONFLICT(attribute_value_id,locale) DO UPDATE SET label=EXCLUDED.label;

CREATE TEMP TABLE _sf451_scope(enforce_data boolean NOT NULL) ON COMMIT DROP;
INSERT INTO _sf451_scope SELECT EXISTS(SELECT 1 FROM public.canonical_variants
 WHERE active AND NOT suppressed AND NOT recalled);

CREATE TEMP TABLE _sf451_models(
 style text PRIMARY KEY, family_id uuid NOT NULL UNIQUE, source_key text NOT NULL
) ON COMMIT DROP;
INSERT INTO _sf451_models VALUES
 ('IF6748','2f6e6f8d-5d48-42c2-9fd1-28d25ebd520c','adidas_adizero_sl2_if6748_australia_official'),
 ('JR6599','db0ae21d-dc31-4a6f-8270-17e4b4da60e2','adidas_terrex_anylander_jr6599_official'),
 ('JR9087','c23719a7-2a5b-4d4b-9074-72973cb88224','adidas_terrex_anylander_rainrdy_jr9087_official');

CREATE TEMP TABLE _sf451_seed(
 style text NOT NULL,attribute_code text NOT NULL,position int NOT NULL,
 value_code text NOT NULL,excerpt text NOT NULL,
 confidence numeric(6,5) NOT NULL DEFAULT 1.0,
 PRIMARY KEY(style,attribute_code,position)
) ON COMMIT DROP;
INSERT INTO _sf451_seed(style,attribute_code,position,value_code,excerpt)
VALUES
 ('IF6748','footwear_technology',0,'lightstrike_pro','Exact adidas IF6748 Adizero SL2 description identifies responsive Lightstrike Pro midsole technology.'),
 ('IF6748','footwear_fit_profile',0,'regular','Exact adidas IF6748 product details state Regular fit; this does not establish a numeric width.'),
 ('JR6599','footwear_technology',0,'traxion','Exact adidas JR6599 Terrex Anylander product details state Traxion outsole.'),
 ('JR6599','footwear_fit_profile',0,'regular','Exact adidas JR6599 product details state Regular fit; distinct from true-to-size guidance.'),
 ('JR6599','sport_use_case',0,'day_hike','Exact adidas JR6599 description explicitly includes extended day hikes.'),
 ('JR9087','footwear_technology',0,'traxion','Exact adidas JR9087 Terrex Anylander RAIN.RDY details state Traxion outsole.'),
 ('JR9087','footwear_technology',1,'rain_rdy','Exact adidas JR9087 product details state RAIN.RDY weather technology.'),
 ('JR9087','footwear_fit_profile',0,'regular','Exact adidas JR9087 product details state Regular fit; width remains ungraded.');

DO $$
DECLARE r record;n int;
BEGIN
 IF (SELECT count(*) FROM _sf451_seed)<>8 THEN
   RAISE EXCEPTION '0451 unexpected technical fact cardinality'; END IF;
 IF NOT (SELECT enforce_data FROM _sf451_scope) THEN RETURN; END IF;
 FOR r IN SELECT * FROM _sf451_models LOOP
   SELECT count(DISTINCT cv.family_id) INTO n FROM public.canonical_variants cv
   JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active
   WHERE cv.family_id=r.family_id
     AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
     AND (upper(coalesce(cv.mpn,''))=r.style
       OR lower(cv.slug) ~ ('(^|-)'||lower(r.style)||'(-|$)'));
   IF n<>1 THEN RAISE EXCEPTION '0451 % canonical exact-style identity drift',r.style; END IF;
   SELECT count(DISTINCT vo.id) INTO n FROM public.vendor_offers vo
   JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
   WHERE cv.family_id=r.family_id AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
     AND vo.status::text='approved' AND coalesce(vo.merchant_visible,true)
     AND NOT coalesce(vo.merchant_pause_active,false);
   IF n<1 THEN RAISE EXCEPTION '0451 % no longer commercially visible',r.style; END IF;
   SELECT count(*) INTO n FROM public.sport_knowledge_sources s
   WHERE s.source_key=r.source_key AND s.active AND s.source_type='manufacturer_product';
   IF n<>1 THEN RAISE EXCEPTION '0451 % lacks exact first-party source',r.style; END IF;
 END LOOP;

 SELECT count(*) INTO n FROM _sf451_seed seed
 JOIN _sf451_models m USING(style)
 JOIN public.attribute_definitions ad ON ad.code=seed.attribute_code AND ad.active
 JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=seed.value_code AND av.active;
 IF n<>8 THEN RAISE EXCEPTION '0451 missing controlled value for a technical fact (found %)',n; END IF;

 SELECT count(*) INTO n FROM _sf451_seed seed
 JOIN _sf451_models m USING(style)
 JOIN public.attribute_definitions ad ON ad.code=seed.attribute_code
 JOIN public.product_family_attribute_values f
  ON f.family_id=m.family_id AND f.attribute_id=ad.id AND f.position=seed.position;
 IF n<>0 THEN RAISE EXCEPTION '0451 occupied or duplicated target attribute position (%)',n; END IF;
END $$;

INSERT INTO public.product_family_attribute_values(
 family_id,attribute_id,position,attribute_value_id,source,confidence)
SELECT m.family_id,ad.id,seed.position,av.id,'enrichment',seed.confidence
FROM _sf451_seed seed JOIN _sf451_models m USING(style)
JOIN public.attribute_definitions ad ON ad.code=seed.attribute_code AND ad.active
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=seed.value_code AND av.active
WHERE (SELECT enforce_data FROM _sf451_scope);

INSERT INTO public.sport_product_fact_evidence(
 family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
 evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence)
SELECT m.family_id,ad.id,seed.position,s.id,
 'manufacturer_claim','page_text',to_jsonb(seed.value_code),
 seed.excerpt,'Exact manufacturer product page: style '||m.style,
 seed.confidence,1.00000
FROM _sf451_seed seed JOIN _sf451_models m USING(style)
JOIN public.attribute_definitions ad ON ad.code=seed.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=m.source_key
WHERE (SELECT enforce_data FROM _sf451_scope);

UPDATE public.sport_product_knowledge k SET last_enriched_at=now(),
 review_notes=concat_ws(' ',nullif(btrim(k.review_notes),''),
 'Schema 0451 exact manufacturer named technology and qualitative fit profile; no inferred width, cushioning intensity, pronation support or weather protection.'),
 updated_at=now()
FROM _sf451_models m
WHERE k.family_id=m.family_id AND (SELECT enforce_data FROM _sf451_scope);

DO $$
DECLARE r record;
BEGIN
 IF NOT (SELECT enforce_data FROM _sf451_scope) THEN RETURN; END IF;
 FOR r IN SELECT family_id FROM _sf451_models LOOP
   PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
 END LOOP;
END $$;

UPDATE public.sport_knowledge_enrichment_queue q
SET requested_fields=ARRAY(
 SELECT rf FROM unnest(q.requested_fields) rf
 WHERE NOT EXISTS(
 SELECT 1 FROM public.product_family_attribute_values f
 JOIN public.attribute_definitions ad ON ad.id=f.attribute_id AND ad.code=rf
 WHERE f.family_id=q.family_id
 ) ORDER BY rf),
 source_hints=coalesce(q.source_hints,'{}'::jsonb)||
 jsonb_build_object('styleScopedSchema',451,'verifiedAt','2026-10-15',
 'noWidthFromRegularFit',true,'technologyDoesNotGradeCushioning',true),
 updated_at=now()
FROM _sf451_models m
WHERE q.family_id=m.family_id AND q.status<>'blocked'
 AND (SELECT enforce_data FROM _sf451_scope);

DO $$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n FROM public.attribute_values av JOIN public.attribute_definitions ad ON ad.id=av.attribute_id
 WHERE ad.code='footwear_technology' AND av.active AND av.code IN ('lightstrike_pro','traxion','rain_rdy');
 IF n<>3 THEN RAISE EXCEPTION '0451 expected three governed manufacturer technologies'; END IF;
 IF NOT (SELECT enforce_data FROM _sf451_scope) THEN RETURN; END IF;
 SELECT count(*) INTO n FROM _sf451_seed seed JOIN _sf451_models m USING(style)
 JOIN public.product_family_attribute_values f ON f.family_id=m.family_id AND f.position=seed.position
 JOIN public.attribute_definitions ad ON ad.id=f.attribute_id AND ad.code=seed.attribute_code
 JOIN public.attribute_values av ON av.id=f.attribute_value_id AND av.code=seed.value_code;
 IF n<>8 THEN RAISE EXCEPTION '0451 normalized facts mismatch (%)',n; END IF;
 SELECT count(*) INTO n FROM _sf451_seed seed JOIN _sf451_models m USING(style)
 JOIN public.sport_product_fact_evidence e ON e.family_id=m.family_id AND e.position=seed.position
 JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code=seed.attribute_code
 JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=m.source_key
 WHERE e.active AND e.evidence_value=to_jsonb(seed.value_code);
 IF n<>8 THEN RAISE EXCEPTION '0451 first-party evidence mismatch (%)',n; END IF;
 SELECT count(*) INTO n FROM _sf451_models m JOIN public.sport_product_knowledge k ON k.family_id=m.family_id
 WHERE k.knowledge_status='conflict' OR k.conflict_count>0;
 IF n<>0 THEN RAISE EXCEPTION '0451 introduced knowledge conflict (%)',n; END IF;
END $$;
COMMIT;

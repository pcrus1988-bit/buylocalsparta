-- KONTA MOY — Sport & Fit schema 0450.
-- Exact adidas Galaxy 8/Response 2 facts and governed treadmill coverage.
-- Supplements 0448/0449; all technical facts remain canonical family-level,
-- source-linked, validated, and independent from vendor price / stock.
-- No arbitrary cushioning, medical support or toe-box facts are inferred.

BEGIN;

CREATE TEMP TABLE _sf450_family(
 style_code text PRIMARY KEY, family_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;
INSERT INTO _sf450_family VALUES
 ('JP6592','7ca4ae5b-1aa4-477f-a4f2-5e592cb77553'),
 ('KJ1750','1d45a143-7d51-439c-9f79-cce81be5b686'),
 ('KJ1757','f2f633fa-2650-479e-832e-6d30f1cb66fa'),
 ('KK4280','392bcff5-6501-4f2c-a2a0-3d03f3799674'),
 ('IH9808','27944931-4820-4f46-9315-3bc9d782cae0');

-- Bootstrap databases have no commercial catalogue. Target checks are strict
-- on any populated catalogue, but empty catalogue acceptance is a no-op.
CREATE TEMP TABLE _sf450_scope AS
 SELECT EXISTS (SELECT 1 FROM public.canonical_variants
   WHERE active AND NOT suppressed AND NOT recalled) AS enforce_data;

DO $$
DECLARE r record; n int;
BEGIN
 IF NOT (SELECT enforce_data FROM _sf450_scope) THEN RETURN; END IF;
 FOR r IN SELECT * FROM _sf450_family LOOP
   SELECT count(DISTINCT cv.family_id) INTO n
   FROM public.canonical_variants cv JOIN public.product_families pf ON pf.id=cv.family_id AND pf.active
   WHERE cv.family_id=r.family_id
     AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
     AND (upper(coalesce(cv.mpn,''))=r.style_code
       OR lower(cv.slug) ~ ('(^|-)' || lower(r.style_code) || '(-|$)'));
   IF n<>1 THEN RAISE EXCEPTION '0450 exact model % changed identity (count %)',r.style_code,n; END IF;
   SELECT count(*) INTO n FROM public.vendor_offers vo
     JOIN public.canonical_variants cv ON cv.id=vo.canonical_variant_id
     WHERE cv.family_id=r.family_id AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
       AND vo.status::text='approved' AND coalesce(vo.merchant_visible,true)
       AND NOT coalesce(vo.merchant_pause_active,false);
   IF n<1 THEN RAISE EXCEPTION '0450 exact model % lost approved visible offer',r.style_code; END IF;
 END LOOP;
END $$;

INSERT INTO public.sport_knowledge_sources
  (source_key,source_type,publisher,title,url,retrieved_at,source_status,metadata,active)
SELECT x.source_key,x.source_type,x.publisher,x.title,x.url,now(),'current',
 jsonb_build_object('reviewDate','2026-10-14','evidencePolicy','explicit first-party facts, exact model or clearly marked model-line',
 'noCushioningOrSupportInference',true,'modelIdentity','checked before normalization'),true
FROM (VALUES
('adidas_galaxy7_medium_treadmill_20261014','manufacturer_guide','adidas','Galaxy 7 Women, Medium / Treadmill model filter','https://www.adidas.com/us/running_promo-medium-galaxy-treadmill'),
('adidas_response2_treadmill_20261014','manufacturer_guide','adidas','Response 2 Running Shoes, Treadmill model filter','https://www.adidas.com/us/response-treadmill'),
('adidas_response2_kk4280_exact_20261014','manufacturer_product','adidas','Response 2 Running Shoes exact KK4280','https://www.adidas.mx/tenis-de-running-response-2/KK4280.html'),
('adidas_galaxy8_ih9808_exact_20261014','manufacturer_product','adidas','Galaxy 8 Running Shoes exact IH9808','https://www.adidas.fi/galaxy-8-running-shoes/IH9808.html'),
('adidas_galaxy8_kz6742_reference_20261014','manufacturer_product','adidas','Galaxy 8 Run same model KZ6742 reference for short distance','https://www.adidas.com/us/galaxy-8-run/KZ6742.html')
) AS x(source_key,source_type,publisher,title,url)
ON CONFLICT(source_key) DO UPDATE SET
 source_type=EXCLUDED.source_type,publisher=EXCLUDED.publisher,
 title=EXCLUDED.title,url=EXCLUDED.url,retrieved_at=EXCLUDED.retrieved_at,
 source_status='current',metadata=EXCLUDED.metadata,active=true,updated_at=now();

CREATE TEMP TABLE _sf450_facts (
 style_code text NOT NULL,
 family_id uuid NOT NULL,
 attribute_code text NOT NULL,
 position integer NOT NULL,
 value_code text NOT NULL,
 source_key text NOT NULL,
 excerpt text NOT NULL,
 confidence numeric NOT NULL,
 identity_confidence numeric NOT NULL,
 PRIMARY KEY(family_id,attribute_code,position)
) ON COMMIT DROP;
INSERT INTO _sf450_facts VALUES
('JP6592','7ca4ae5b-1aa4-477f-a4f2-5e592cb77553','footwear_width_profile',0,'standard','adidas_galaxy7_medium_treadmill_20261014','Galaxy 7 women''s footwear is listed under the adidas manufacturer Medium width collection. Medium width is normalized as standard; this does not establish toe-box shape.','.96',.95),
('JP6592','7ca4ae5b-1aa4-477f-a4f2-5e592cb77553','sport_surface',1,'treadmill','adidas_galaxy7_medium_treadmill_20261014','Galaxy 7 Running Shoes Women are explicitly displayed in the adidas Treadmill manufacturer collection.','.98',.98),
('KJ1750','1d45a143-7d51-439c-9f79-cce81be5b686','sport_surface',1,'treadmill','adidas_response2_treadmill_20261014','Response 2 Running Shoes Men is listed in the adidas treadmill collection; the exact KJ1750 road model is preserved.','.96',.96),
('KJ1757','f2f633fa-2650-479e-832e-6d30f1cb66fa','sport_surface',2,'treadmill','adidas_response2_treadmill_20261014','Response 2 Running Shoes Women is listed in the adidas treadmill collection; existing road and trail model evidence is retained.','.96',.96),
('KK4280','392bcff5-6501-4f2c-a2a0-3d03f3799674','sport_surface',1,'treadmill','adidas_response2_treadmill_20261014','Response 2 Running Shoes Men is listed in the adidas treadmill collection; exact KK4280 product identity was independently confirmed.','.96',.96),
('KK4280','392bcff5-6501-4f2c-a2a0-3d03f3799674','footwear_technology',0,'cloudfoam_plus','adidas_response2_kk4280_exact_20261014','The official adidas KK4280 product description explicitly identifies a Cloudfoam+ EVA midsole.','1.00000',1.00000),
('KK4280','392bcff5-6501-4f2c-a2a0-3d03f3799674','footwear_fit_profile',0,'regular','adidas_response2_kk4280_exact_20261014','The official adidas KK4280 product details state Ajuste clásico (regular fit). This qualitative fit label is independent of width.','1.00000',1.00000),
('IH9808','27944931-4820-4f46-9315-3bc9d782cae0','sport_surface',0,'road','adidas_galaxy8_ih9808_exact_20261014','The official adidas IH9808 men''s Galaxy 8 page explicitly classifies it for road running.','1.00000',1.00000),
('IH9808','27944931-4820-4f46-9315-3bc9d782cae0','fit_length_profile',0,'true_to_size','adidas_galaxy8_ih9808_exact_20261014','The exact official adidas IH9808 page advises ordering the usual size.','1.00000',1.00000),
('IH9808','27944931-4820-4f46-9315-3bc9d782cae0','sport_use_case',1,'short_mid_distance_training','adidas_galaxy8_kz6742_reference_20261014','The adidas Galaxy 8 model line is explicitly classified Short (0–6 mi) in the manufacturer distance field. Applies only to model use-case, not variant-specific geometry.','.97000',.97000);

-- Only family-level facts supported by exactly one active controlled code.
DO $$
DECLARE n int;
BEGIN
 IF (SELECT count(*) FROM _sf450_facts)<>10 THEN RAISE EXCEPTION '0450 expected 10 curated facts'; END IF;
 SELECT count(*) INTO n
 FROM _sf450_facts f JOIN public.attribute_definitions ad
 ON ad.code=f.attribute_code AND ad.active
 JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code AND av.active;
 IF n<>10 THEN RAISE EXCEPTION '0450 controlled vocabulary missing (found %)',n; END IF;
 IF NOT (SELECT enforce_data FROM _sf450_scope) THEN RETURN; END IF;
 SELECT count(*) INTO n FROM _sf450_facts f
 JOIN public.product_family_attribute_values pfav
 ON pfav.family_id=f.family_id AND pfav.position=f.position
 JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=f.attribute_code;
 IF n<>0 THEN RAISE EXCEPTION '0450 target positions already populated (%)',n; END IF;
END $$;

INSERT INTO public.product_family_attribute_values
 (family_id,attribute_id,position,attribute_value_id,source,confidence)
SELECT f.family_id,ad.id,f.position,av.id,'enrichment',f.confidence
FROM _sf450_facts f JOIN public.attribute_definitions ad
 ON ad.code=f.attribute_code AND ad.active
JOIN public.attribute_values av ON av.attribute_id=ad.id AND av.code=f.value_code AND av.active
WHERE (SELECT enforce_data FROM _sf450_scope);

INSERT INTO public.sport_product_fact_evidence
 (family_id,attribute_id,position,source_id,evidence_strength,extraction_method,
 evidence_value,evidence_excerpt,source_locator,confidence,identity_confidence)
SELECT f.family_id,ad.id,f.position,s.id,'manufacturer_claim','page_text',
 to_jsonb(f.value_code),f.excerpt,
 CASE WHEN s.source_type='manufacturer_product'
   THEN 'Exact product details / model-level manufacturer specification'
   ELSE 'Official manufacturer collection showing exact model' END,
 f.confidence,f.identity_confidence
FROM _sf450_facts f JOIN public.attribute_definitions ad ON ad.code=f.attribute_code
JOIN public.sport_knowledge_sources s ON s.source_key=f.source_key AND s.active
WHERE (SELECT enforce_data FROM _sf450_scope);

UPDATE public.sport_product_knowledge k SET
 last_enriched_at=now(),updated_at=now(),
 review_notes=concat_ws(' ',nullif(btrim(k.review_notes),''),
 'Schema 0450: exact/validated model-level adidas treadmill, fit and use evidence added. No cushioning/support/width assumptions beyond directly classified facts.')
WHERE k.family_id IN (SELECT family_id FROM _sf450_family)
 AND (SELECT enforce_data FROM _sf450_scope);

DO $$
DECLARE r record;
BEGIN
 IF NOT (SELECT enforce_data FROM _sf450_scope) THEN RETURN; END IF;
 FOR r IN SELECT family_id FROM _sf450_family LOOP
   PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
 END LOOP;
END $$;

UPDATE public.sport_knowledge_enrichment_queue q
SET requested_fields=ARRAY(
 SELECT requested_field FROM unnest(q.requested_fields) AS requested_field
 WHERE NOT EXISTS (
  SELECT 1 FROM public.product_family_attribute_values pfav
  JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=requested_field
  WHERE pfav.family_id=q.family_id
 ) ORDER BY requested_field),
 source_hints=coalesce(q.source_hints,'{}'::jsonb)||
 jsonb_build_object('lastVerifiedSchema',450,'sourceReviewedAt','2026-10-14',
 'manufacturerFitIndependentOfWidth',true,'namedTechnologyIndependentOfCushioningGrade',true),
 updated_at=now()
FROM _sf450_family fam
WHERE q.family_id=fam.family_id AND q.status<>'blocked'
 AND (SELECT enforce_data FROM _sf450_scope);

DO $$
DECLARE n int;
BEGIN
 IF NOT (SELECT enforce_data FROM _sf450_scope) THEN RETURN; END IF;
 SELECT count(*) INTO n FROM public.product_family_attribute_values pfav
 JOIN _sf450_facts f ON f.family_id=pfav.family_id AND f.position=pfav.position
 JOIN public.attribute_definitions ad ON ad.id=pfav.attribute_id AND ad.code=f.attribute_code
 JOIN public.attribute_values av ON av.id=pfav.attribute_value_id AND av.code=f.value_code;
 IF n<>10 THEN RAISE EXCEPTION '0450 expected 10 facts, got %',n; END IF;
 SELECT count(*) INTO n FROM public.sport_product_fact_evidence e
 JOIN _sf450_facts f ON f.family_id=e.family_id AND f.position=e.position
 JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code=f.attribute_code
 JOIN public.sport_knowledge_sources s ON s.id=e.source_id AND s.source_key=f.source_key
 WHERE e.active AND e.evidence_value=to_jsonb(f.value_code);
 IF n<>10 THEN RAISE EXCEPTION '0450 expected 10 active first-party evidence, got %',n; END IF;
 SELECT count(*) INTO n FROM public.sport_product_knowledge k
 JOIN _sf450_family fam ON fam.family_id=k.family_id
 WHERE k.knowledge_status='conflict' OR k.conflict_count>0;
 IF n<>0 THEN RAISE EXCEPTION '0450 introduced % governed knowledge conflicts',n; END IF;
END $$;

COMMIT;

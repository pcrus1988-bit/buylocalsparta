-- KONTA MOY Sport & Fit schema 0449: reconcile Squadra 25 exact-manufacturer
-- football evidence against weaker broad catalogue classifications.
-- Existing first-party source/evidence is reused; no new technical claims.

BEGIN;

CREATE TEMP TABLE _sf_449_target(
  style_code text PRIMARY KEY,
  family_id uuid NOT NULL UNIQUE,
  manufacturer_source_key text NOT NULL
) ON COMMIT DROP;

-- Clean-database CI has no catalogue records, so no family-specific repair is
-- applicable. On an initialized catalogue, every target still fails closed
-- unless its exact identity, approved offer and evidence are present.
INSERT INTO _sf_449_target(style_code,family_id,manufacturer_source_key)
SELECT style_code,family_id::uuid,manufacturer_source_key
FROM (VALUES
('JV6067','5104fcde-d543-4b52-9d48-27d6d35f638f','adidas_squadra25_training_jacket_jv6067_official'),
('JP3389','84233778-46a2-43a7-8d5a-ec0b8419381b','adidas_squadra25_training_jacket_jp3389_official'),
('JE2774','64d56fd3-cab7-4036-af37-4f63d7f43aae','adidas_squadra25_training_jacket_je2774_official')
) target(style_code,family_id,manufacturer_source_key)
WHERE EXISTS (
  SELECT 1 FROM public.canonical_variants
  WHERE active=true AND suppressed=false AND recalled=false
);

DO $$
DECLARE r record; n integer;
BEGIN
  FOR r IN SELECT * FROM _sf_449_target LOOP
    SELECT count(*) INTO n FROM public.product_families pf
    WHERE pf.id=r.family_id AND pf.active
      AND EXISTS (SELECT 1 FROM public.canonical_variants cv
        WHERE cv.family_id=pf.id AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
        AND cv.slug ~* ('(^|-)' || lower(r.style_code) || '(-|$)'))
      AND EXISTS (SELECT 1 FROM public.canonical_variants cv
        JOIN public.vendor_offers vo ON vo.canonical_variant_id=cv.id
        WHERE cv.family_id=pf.id AND cv.active AND NOT cv.suppressed AND NOT cv.recalled
        AND vo.status::text='approved' AND coalesce(vo.merchant_visible,true)
        AND NOT coalesce(vo.merchant_pause_active,false));
    IF n<>1 THEN RAISE EXCEPTION 'Sport Fit 0449 missing exact sellable family for %',r.style_code; END IF;
  END LOOP;
END $$;

CREATE TEMP TABLE _sf_449_manufacturer AS
SELECT t.family_id,e.id evidence_id
FROM _sf_449_target t
JOIN public.sport_knowledge_sources s ON s.source_key=t.manufacturer_source_key
  AND s.active AND s.source_type='manufacturer_product'
JOIN public.attribute_definitions ad ON ad.code='sport_activity' AND ad.active
JOIN public.sport_product_fact_evidence e
  ON e.family_id=t.family_id AND e.attribute_id=ad.id AND e.source_id=s.id
  AND e.active AND e.position=0 AND e.evidence_value=to_jsonb('football'::text)
  AND e.confidence>=0.99 AND e.identity_confidence>=0.99;

CREATE TEMP TABLE _sf_449_taxonomy AS
SELECT t.family_id,e.id evidence_id
FROM _sf_449_target t
JOIN public.sport_knowledge_sources s ON s.source_key='kontamou_catalog_taxonomy'
JOIN public.attribute_definitions ad ON ad.code='sport_activity'
JOIN public.sport_product_fact_evidence e ON e.family_id=t.family_id
  AND e.attribute_id=ad.id AND e.source_id=s.id AND e.position=0
  AND e.active AND e.evidence_value=to_jsonb('general_training'::text)
  AND e.evidence_strength='catalog_classification';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sf_449_target) THEN RETURN; END IF;
  IF (SELECT count(*) FROM _sf_449_manufacturer)<>3 OR
     (SELECT count(*) FROM _sf_449_taxonomy)<>3 THEN
    RAISE EXCEPTION 'Sport Fit 0449 evidence cardinality changed; abort rather than guess';
  END IF;
END $$;

UPDATE public.sport_product_fact_evidence e
SET active=false,superseded_by=m.evidence_id
FROM _sf_449_taxonomy t JOIN _sf_449_manufacturer m USING(family_id)
WHERE e.id=t.evidence_id;

UPDATE public.sport_product_knowledge k
SET review_notes=concat_ws(' ',nullif(btrim(k.review_notes),''),
  'Schema 0449: verified exact Squadra 25 Football manufacturer classification governs; broad general_training catalogue observation retained as superseded audit history. Unspecified properties remain unknown.'),
  last_enriched_at=now(),updated_at=now()
WHERE k.family_id IN (SELECT family_id FROM _sf_449_target);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT family_id FROM _sf_449_target LOOP
    PERFORM bls_private.refresh_sport_product_knowledge(r.family_id);
  END LOOP;
END $$;

UPDATE public.sport_knowledge_enrichment_queue q
SET status=CASE WHEN q.status='blocked' THEN q.status ELSE 'partial' END,
  requested_fields=ARRAY(
    SELECT field FROM unnest(q.requested_fields) field WHERE
      NOT EXISTS (SELECT 1 FROM public.product_family_attribute_values f
        JOIN public.attribute_definitions ad ON ad.id=f.attribute_id AND ad.code=field
        WHERE f.family_id=q.family_id)
      ORDER BY field),
  source_hints=coalesce(q.source_hints,'{}'::jsonb)||
    jsonb_build_object('taxonomyConflictReconciledAtSchema',449,'authoritativeActivity','football'),
  reason='Squadra 25 exact manufacturer football activity governs; unresolved fields retained.',
  updated_at=now()
WHERE q.family_id IN (SELECT family_id FROM _sf_449_target) AND q.status<>'blocked';

DO $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _sf_449_target) THEN RETURN; END IF;
  SELECT count(*) INTO n FROM _sf_449_taxonomy t
    JOIN _sf_449_manufacturer m USING(family_id)
    JOIN public.sport_product_fact_evidence e ON e.id=t.evidence_id
    WHERE e.active=false AND e.superseded_by=m.evidence_id;
  IF n<>3 THEN RAISE EXCEPTION 'Sport Fit 0449 failed taxonomy supersession'; END IF;

  SELECT count(*) INTO n FROM public.sport_product_knowledge k
    JOIN _sf_449_target t ON t.family_id=k.family_id
    WHERE k.knowledge_status='conflict' OR k.conflict_count>0;
  IF n<>0 THEN RAISE EXCEPTION 'Sport Fit 0449 left % conflicts',n; END IF;

  SELECT count(*) INTO n FROM public.product_family_attribute_values f
    JOIN _sf_449_target t ON t.family_id=f.family_id
    JOIN public.attribute_definitions ad ON ad.id=f.attribute_id AND ad.code='sport_activity'
    JOIN public.attribute_values av ON av.id=f.attribute_value_id
    WHERE av.code='football';
  IF n<>3 THEN RAISE EXCEPTION 'Sport Fit 0449 lost football facts'; END IF;

  SELECT count(*) INTO n FROM public.sport_product_fact_evidence e
    JOIN _sf_449_target t ON t.family_id=e.family_id
    JOIN public.attribute_definitions ad ON ad.id=e.attribute_id AND ad.code='sport_activity'
    JOIN public.sport_knowledge_sources s ON s.id=e.source_id
    WHERE e.active AND s.source_key='kontamou_catalog_taxonomy';
  IF n<>0 THEN RAISE EXCEPTION 'Sport Fit 0449 left lower-tier conflicting evidence active'; END IF;
END $$;

COMMIT;

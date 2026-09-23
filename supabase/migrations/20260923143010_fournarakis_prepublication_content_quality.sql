CREATE OR REPLACE FUNCTION bls_private.fournarakis_normalize_title(p_title text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO 'pg_catalog','public','bls_private'
AS $$
DECLARE
  v_token text;
  v_tokens text[];
  v_out text[] := ARRAY[]::text[];
  v_result text;
  v_greek integer;
  v_latin integer;
BEGIN
  v_tokens := regexp_split_to_array(regexp_replace(btrim(p_title), '\s+', ' ', 'g'), ' ');
  FOREACH v_token IN ARRAY v_tokens LOOP
    v_greek := char_length(regexp_replace(v_token, '[^Α-Ωα-ωάέήίόύώϊϋΐΰ]', '', 'g'));
    v_latin := char_length(regexp_replace(v_token, '[^A-Za-z]', '', 'g'));
    IF v_greek > 0 AND v_latin > 0 THEN
      IF v_greek >= v_latin THEN
        v_token := translate(v_token,'ABEHIKMNOPTYXabehikmnoptyx','ΑΒΕΗΙΚΜΝΟΡΤΥΧαβεηικμνορτυχ');
      ELSE
        v_token := translate(v_token,'ΑΒΕΗΙΚΜΝΟΡΤΥΧαβεηικμνορτυχ','ABEHIKMNOPTYXabehikmnoptyx');
      END IF;
    END IF;
    v_out := array_append(v_out, v_token);
  END LOOP;
  v_result := array_to_string(v_out, ' ');
  v_result := replace(v_result, 'ANTIMOYXΛIKH', 'ΑΝΤΙΜΟΥΧΛΙΚΗ');
  v_result := replace(v_result, 'ΕΧΤRΑ', 'EXTRA');
  v_result := replace(v_result, 'ΤV', 'TV');
  v_result := replace(v_result, 'ΑΒS', 'ABS');
  v_result := replace(v_result, 'ΔIXTAKI', 'ΔΙΧΤΑΚΙ');
  v_result := replace(v_result, 'NOBOΠAN', 'ΝΟΒΟΠΑΝ');
  RETURN v_result;
END
$$;

COMMENT ON FUNCTION bls_private.fournarakis_normalize_title(text)
IS 'Deterministically repairs mixed Greek/Latin glyph errors in Fournarakis canonical presentation titles without mutating source evidence.';

CREATE TEMP TABLE _fourn_web ON COMMIT DROP AS
WITH snap AS (
  SELECT s.id
  FROM public.catalog_source_snapshots s
  JOIN public.catalog_sources cs ON cs.id=s.source_id
  WHERE cs.code='fournarakis-gr' AND s.source_version='web-crawler-v1'
  ORDER BY s.created_at DESC LIMIT 1
)
SELECT p.id AS source_product_id,p.supplier_code,p.title AS source_title,p.source_url,
       COALESCE(p.normalized_payload->'attributes','{}'::jsonb) AS attrs,
       COALESCE(p.normalized_payload->'variantAttributes','{}'::jsonb) AS variant_attrs,
       NULLIF(btrim(p.normalized_payload->>'supplierDescription'),'') AS supplier_description,
       p.normalized_payload->'attributes'->>'Fournarakis family code' AS family_code,
       p.normalized_payload->'categoryPath'->>-1 AS leaf_category,
       COALESCE(NULLIF(btrim(p.source_identity->>'brand'),''),NULLIF(btrim(p.raw_payload->'extracted'->>'brand'),'')) AS source_brand,
       l.canonical_variant_id,cv.family_id
FROM public.catalog_source_products p
JOIN public.catalog_source_product_links l ON l.source_product_id=p.id AND l.link_status='approved'
JOIN public.canonical_variants cv ON cv.id=l.canonical_variant_id
WHERE p.snapshot_id=(SELECT id FROM snap);

CREATE TEMP TABLE _fourn_family_target ON COMMIT DROP AS
SELECT DISTINCT ON (family_code) family_code,family_id AS target_family_id
FROM _fourn_web
WHERE family_code IS NOT NULL AND family_id IS NOT NULL
ORDER BY family_code,supplier_code,canonical_variant_id;

UPDATE public.canonical_variants cv
SET family_id=t.target_family_id
FROM _fourn_web w
JOIN _fourn_family_target t USING(family_code)
WHERE cv.id=w.canonical_variant_id
  AND cv.family_id IS DISTINCT FROM t.target_family_id;

CREATE TEMP TABLE _fourn_varying_keys ON COMMIT DROP AS
SELECT w.family_code,e.key
FROM _fourn_web w
CROSS JOIN LATERAL jsonb_each_text(w.variant_attrs) e
WHERE NULLIF(btrim(e.value),'') IS NOT NULL
  AND btrim(e.value)<>'-'
  AND lower(e.key) !~ '(τμχ|κουτι|πακ|pack|box|set /|ζευγη)'
  AND lower(e.key) !~ '(συνδυαζεται|καταλληλο|ταιριαζει|compatible|fournarakis)'
GROUP BY w.family_code,e.key
HAVING count(DISTINCT NULLIF(btrim(e.value),''))>1;

CREATE TEMP TABLE _fourn_content ON COMMIT DROP AS
WITH family_stats AS (
  SELECT family_code,count(*) AS n FROM _fourn_web GROUP BY family_code
),
base AS (
  SELECT w.*,fs.n AS family_size,
         bls_private.fournarakis_normalize_title(w.source_title) AS base_title,
         suffix.suffix,
         NULLIF(btrim(COALESCE(NULLIF(w.attrs->>'ΚΑΤΑΛΛΗΛΟ ΓΙΑ','-'),NULLIF(w.attrs->>'ΤΑΙΡΙΑΖΕΙ ΣΕ','-'),NULLIF(w.attrs->>'ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ','-'))),'') AS relation_ref,
         facts.fact_summary,
         w.attrs - 'Fournarakis family code' - 'Fournarakis tags' - 'ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ' - 'ΚΑΤΑΛΛΗΛΟ ΓΙΑ' - 'ΤΑΙΡΙΑΖΕΙ ΣΕ' AS clean_specifications
  FROM _fourn_web w
  JOIN family_stats fs USING(family_code)
  LEFT JOIN LATERAL (
    SELECT string_agg(label||' '||value,' · ' ORDER BY priority,key) AS suffix
    FROM (
      SELECT e.key,
             CASE e.key
               WHEN 'ΜΕΓΕΘΟΣ' THEN 'Μέγεθος' WHEN 'ΧΡΩΜΑ' THEN 'Χρώμα' WHEN 'ΜΗΚΟΣ' THEN 'Μήκος'
               WHEN 'ΠΛΑΤΟΣ' THEN 'Πλάτος' WHEN 'ΥΨΟΣ' THEN 'Ύψος' WHEN 'ΔΙΑΜΕΤΡΟΣ' THEN 'Διάμετρος'
               WHEN 'ΠΑΧΟΣ' THEN 'Πάχος' WHEN 'ΒΑΡΟΣ' THEN 'Βάρος' WHEN 'ΧΩΡΗΤΙΚΟΤΗΤΑ' THEN 'Χωρητικότητα'
               WHEN 'ΚΟΚΚΩΣΗ' THEN 'Κόκκωση' WHEN 'ΠΡΟΦΙΛ' THEN 'Προφίλ' WHEN 'ΤΥΠΟΣ' THEN 'Τύπος'
               WHEN 'ΣΠΕΙΡΩΜΑ' THEN 'Σπείρωμα' WHEN 'ΦΙΝΙΡΙΣΜΑ' THEN 'Φινίρισμα' ELSE e.key END AS label,
             regexp_replace(e.value,'([0-9])\s*(mm|cm|kg|ml|g|l|m|w|v)$','\1 \2','i') AS value,
             CASE e.key
               WHEN 'ΜΕΓΕΘΟΣ' THEN 1 WHEN 'ΧΡΩΜΑ' THEN 2 WHEN 'ΜΗΚΟΣ' THEN 3 WHEN 'ΠΛΑΤΟΣ' THEN 4
               WHEN 'ΥΨΟΣ' THEN 5 WHEN 'ΔΙΑΜΕΤΡΟΣ' THEN 6 WHEN 'ΠΑΧΟΣ' THEN 7 WHEN 'ΒΑΡΟΣ' THEN 8
               WHEN 'ΧΩΡΗΤΙΚΟΤΗΤΑ' THEN 9 WHEN 'ΚΟΚΚΩΣΗ' THEN 10 WHEN 'ΠΡΟΦΙΛ' THEN 11
               WHEN 'ΤΥΠΟΣ' THEN 12 WHEN 'ΣΠΕΙΡΩΜΑ' THEN 13 WHEN 'ΦΙΝΙΡΙΣΜΑ' THEN 14 ELSE 50 END AS priority
      FROM jsonb_each_text(w.variant_attrs) e
      JOIN _fourn_varying_keys vk ON vk.family_code=w.family_code AND vk.key=e.key
      WHERE NULLIF(btrim(e.value),'') IS NOT NULL AND btrim(e.value)<>'-'
      ORDER BY priority,e.key LIMIT 3
    ) x
  ) suffix ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(label||': '||value,' · ' ORDER BY priority,key) AS fact_summary
    FROM (
      SELECT e.key,
             CASE e.key
               WHEN 'ΜΕΓΕΘΟΣ' THEN 'Μέγεθος' WHEN 'ΧΡΩΜΑ' THEN 'Χρώμα' WHEN 'ΜΗΚΟΣ' THEN 'Μήκος'
               WHEN 'ΠΛΑΤΟΣ' THEN 'Πλάτος' WHEN 'ΥΨΟΣ' THEN 'Ύψος' WHEN 'ΔΙΑΜΕΤΡΟΣ' THEN 'Διάμετρος'
               WHEN 'ΠΑΧΟΣ' THEN 'Πάχος' WHEN 'ΒΑΡΟΣ' THEN 'Βάρος' WHEN 'ΧΩΡΗΤΙΚΟΤΗΤΑ' THEN 'Χωρητικότητα'
               WHEN 'ΚΟΚΚΩΣΗ' THEN 'Κόκκωση' WHEN 'ΠΡΟΦΙΛ' THEN 'Προφίλ' WHEN 'ΤΥΠΟΣ' THEN 'Τύπος'
               WHEN 'ΣΠΕΙΡΩΜΑ' THEN 'Σπείρωμα' WHEN 'ΦΙΝΙΡΙΣΜΑ' THEN 'Φινίρισμα' WHEN 'ΜΟΝΤΕΛΟ' THEN 'Μοντέλο'
               WHEN 'ΚΩΔΙΚΟΣ ΚΑΤΑΣΚΕΥΑΣΤΗ' THEN 'Κωδικός κατασκευαστή'
               WHEN 'ΤΜΧ /KOYTI' THEN 'Τεμάχια / κιβώτιο' WHEN 'ΠΑΚ. /KOYTI' THEN 'Πακέτα / κιβώτιο'
               WHEN 'ΤΜΧ /ΠΑΚ.' THEN 'Τεμάχια / πακέτο' WHEN 'ΣΕΤ /KOYTI' THEN 'Σετ / κιβώτιο'
               WHEN 'ΖΕΥΓΗ /KOYTI' THEN 'Ζεύγη / κιβώτιο' ELSE e.key END AS label,
             regexp_replace(e.value,'([0-9])\s*(mm|cm|kg|ml|g|l|m|w|v)$','\1 \2','i') AS value,
             CASE e.key
               WHEN 'ΜΕΓΕΘΟΣ' THEN 1 WHEN 'ΧΡΩΜΑ' THEN 2 WHEN 'ΜΗΚΟΣ' THEN 3 WHEN 'ΠΛΑΤΟΣ' THEN 4
               WHEN 'ΥΨΟΣ' THEN 5 WHEN 'ΔΙΑΜΕΤΡΟΣ' THEN 6 WHEN 'ΠΑΧΟΣ' THEN 7 WHEN 'ΒΑΡΟΣ' THEN 8
               WHEN 'ΧΩΡΗΤΙΚΟΤΗΤΑ' THEN 9 WHEN 'ΚΟΚΚΩΣΗ' THEN 10 WHEN 'ΠΡΟΦΙΛ' THEN 11
               WHEN 'ΤΥΠΟΣ' THEN 12 WHEN 'ΣΠΕΙΡΩΜΑ' THEN 13 WHEN 'ΦΙΝΙΡΙΣΜΑ' THEN 14
               WHEN 'ΜΟΝΤΕΛΟ' THEN 15 WHEN 'ΚΩΔΙΚΟΣ ΚΑΤΑΣΚΕΥΑΣΤΗ' THEN 16
               WHEN 'ΤΜΧ /KOYTI' THEN 80 WHEN 'ΠΑΚ. /KOYTI' THEN 81 WHEN 'ΤΜΧ /ΠΑΚ.' THEN 82
               WHEN 'ΣΕΤ /KOYTI' THEN 83 WHEN 'ΖΕΥΓΗ /KOYTI' THEN 84 ELSE 50 END AS priority
      FROM jsonb_each_text(w.attrs) e
      WHERE e.key NOT IN ('Fournarakis family code','Fournarakis tags','ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ','ΚΑΤΑΛΛΗΛΟ ΓΙΑ','ΤΑΙΡΙΑΖΕΙ ΣΕ')
        AND NULLIF(btrim(e.value),'') IS NOT NULL AND btrim(e.value)<>'-'
      ORDER BY priority,e.key LIMIT 4
    ) y
  ) facts ON true
),
candidate AS (
  SELECT *,CASE
      WHEN family_size>1 AND suffix IS NOT NULL THEN left(base_title||' — '||suffix,180)
      WHEN family_size>1 AND relation_ref IS NOT NULL THEN left(base_title||' — για '||relation_ref,180)
      ELSE base_title END AS candidate_title
  FROM base
),
deduped AS (
  SELECT *,CASE
      WHEN count(*) OVER(PARTITION BY family_code,candidate_title)>1 THEN left(candidate_title||' · κωδ. '||supplier_code,180)
      ELSE candidate_title END AS final_title
  FROM candidate
)
SELECT *,
  CASE
    WHEN supplier_description IS NULL OR supplier_description='*Η συσκευασία δεν σπάει' OR length(supplier_description)<80
    THEN final_title||'.'
      || CASE WHEN source_brand IS NOT NULL AND lower(source_brand) NOT IN ('miscellaneous','unbranded') THEN ' Μάρκα: '||source_brand||'.' ELSE '' END
      || CASE WHEN leaf_category IS NOT NULL THEN ' Κατηγορία: «'||leaf_category||'».' ELSE '' END
      || CASE WHEN fact_summary IS NOT NULL THEN ' Βασικά χαρακτηριστικά: '||fact_summary||'.' ELSE '' END
      || CASE WHEN supplier_description='*Η συσκευασία δεν σπάει' THEN ' Σημείωση συσκευασίας: Η συσκευασία δεν σπάει.'
              WHEN supplier_description IS NOT NULL THEN ' '||regexp_replace(supplier_description,'^\*','') ELSE '' END
    ELSE supplier_description END AS final_description
FROM deduped;

UPDATE public.product_translations pt
SET title=c.final_title,description=c.final_description,specifications=c.clean_specifications,
    seo_title=left(c.final_title,70),seo_description=left(regexp_replace(c.final_description,'\s+',' ','g'),160)
FROM _fourn_content c
WHERE pt.canonical_variant_id=c.canonical_variant_id AND pt.locale='el';

UPDATE public.product_compatibility_claims pc
SET review_status='superseded'
FROM _fourn_web w
WHERE pc.source_product_id=w.source_product_id
  AND pc.relationship_type='works_with'
  AND pc.target_kind='external_model'
  AND btrim(COALESCE(pc.target_reference,'')) IN ('-','—','N/A','n/a')
  AND pc.review_status<>'superseded';

WITH edges AS (
  SELECT DISTINCT w.source_product_id,w.canonical_variant_id AS subject_canonical_variant_id,w.source_url,
         w.attrs->>'ΤΑΙΡΙΑΖΕΙ ΣΕ' AS raw_value,btrim(token) AS target_reference
  FROM _fourn_web w
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(w.attrs->>'ΤΑΙΡΙΑΖΕΙ ΣΕ',''),'\s*[,;|]\s*') token
  WHERE btrim(token) NOT IN ('','-','—','N/A','n/a')
),
resolved AS (
  SELECT e.*,t.canonical_variant_id AS target_canonical_variant_id
  FROM edges e
  LEFT JOIN _fourn_web t ON t.supplier_code=e.target_reference AND t.canonical_variant_id IS DISTINCT FROM e.subject_canonical_variant_id
)
INSERT INTO public.product_compatibility_claims(
  source_product_id,subject_canonical_variant_id,target_kind,target_canonical_variant_id,target_reference,
  relationship_type,evidence_level,review_status,confidence,source_reference,evidence
)
SELECT r.source_product_id,r.subject_canonical_variant_id,
       CASE WHEN r.target_canonical_variant_id IS NOT NULL THEN 'canonical_variant' ELSE 'external_model' END,
       r.target_canonical_variant_id,
       CASE WHEN r.target_canonical_variant_id IS NULL THEN r.target_reference ELSE NULL END,
       'fits','explicit','candidate',
       CASE WHEN r.target_canonical_variant_id IS NOT NULL THEN 0.99 ELSE 0.97 END,
       r.source_url,
       jsonb_build_object(
         'basis','explicit supplier attribute ΤΑΙΡΙΑΖΕΙ ΣΕ',
         'sourceAttribute','ΤΑΙΡΙΑΖΕΙ ΣΕ',
         'rawValue',r.raw_value,
         'targetReference',r.target_reference,
         'targetResolution',CASE WHEN r.target_canonical_variant_id IS NOT NULL THEN 'exact_supplier_code' ELSE 'unresolved_reference' END,
         'importerVersion','fournarakis-web-relationships-v2'
       )
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_compatibility_claims x
  WHERE x.source_product_id=r.source_product_id
    AND x.subject_canonical_variant_id=r.subject_canonical_variant_id
    AND x.relationship_type='fits'
    AND x.review_status<>'superseded'
    AND (
      (r.target_canonical_variant_id IS NOT NULL AND x.target_kind='canonical_variant' AND x.target_canonical_variant_id=r.target_canonical_variant_id)
      OR
      (r.target_canonical_variant_id IS NULL AND x.target_kind='external_model' AND x.target_reference=r.target_reference)
    )
);
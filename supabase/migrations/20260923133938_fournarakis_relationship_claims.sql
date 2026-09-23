ALTER TABLE public.product_compatibility_claims
  DROP CONSTRAINT IF EXISTS product_compatibility_claims_relationship_type_check;

ALTER TABLE public.product_compatibility_claims
  ADD CONSTRAINT product_compatibility_claims_relationship_type_check
  CHECK (relationship_type = ANY (ARRAY[
    'compatible_with'::text,
    'fits'::text,
    'uses_platform'::text,
    'requires'::text,
    'interface_match'::text,
    'works_with'::text
  ]));

WITH latest_web_snapshot AS (
  SELECT s.id
  FROM public.catalog_source_snapshots s
  JOIN public.catalog_sources cs ON cs.id=s.source_id
  WHERE cs.code='fournarakis-gr'
    AND s.source_version='web-crawler-v1'
  ORDER BY s.created_at DESC
  LIMIT 1
),
web AS (
  SELECT p.id,
         p.supplier_code,
         p.source_url,
         p.normalized_payload,
         l.canonical_variant_id
  FROM public.catalog_source_products p
  JOIN latest_web_snapshot s ON s.id=p.snapshot_id
  JOIN public.catalog_source_product_links l
    ON l.source_product_id=p.id
   AND l.link_status='approved'
),
fit_edges AS (
  SELECT DISTINCT
         w.id AS source_product_id,
         w.canonical_variant_id AS subject_canonical_variant_id,
         w.source_url,
         w.normalized_payload->'attributes'->>'ΚΑΤΑΛΛΗΛΟ ΓΙΑ' AS raw_value,
         btrim(token) AS target_reference
  FROM web w
  CROSS JOIN LATERAL regexp_split_to_table(
    coalesce(w.normalized_payload->'attributes'->>'ΚΑΤΑΛΛΗΛΟ ΓΙΑ',''),
    '\s*[,;|]\s*'
  ) token
  WHERE btrim(token)<>''
)
INSERT INTO public.product_compatibility_claims(
  source_product_id,
  subject_canonical_variant_id,
  target_kind,
  target_reference,
  relationship_type,
  evidence_level,
  review_status,
  confidence,
  source_reference,
  evidence
)
SELECT e.source_product_id,
       e.subject_canonical_variant_id,
       'external_model',
       e.target_reference,
       'fits',
       'explicit',
       'candidate',
       0.97,
       e.source_url,
       jsonb_build_object(
         'basis','explicit supplier attribute ΚΑΤΑΛΛΗΛΟ ΓΙΑ',
         'sourceAttribute','ΚΑΤΑΛΛΗΛΟ ΓΙΑ',
         'rawValue',e.raw_value,
         'targetReference',e.target_reference,
         'importerVersion','fournarakis-web-relationships-v1'
       )
FROM fit_edges e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_compatibility_claims x
  WHERE x.source_product_id=e.source_product_id
    AND x.subject_canonical_variant_id=e.subject_canonical_variant_id
    AND x.target_kind='external_model'
    AND x.target_reference=e.target_reference
    AND x.relationship_type='fits'
    AND x.review_status<>'superseded'
);

WITH latest_web_snapshot AS (
  SELECT s.id
  FROM public.catalog_source_snapshots s
  JOIN public.catalog_sources cs ON cs.id=s.source_id
  WHERE cs.code='fournarakis-gr'
    AND s.source_version='web-crawler-v1'
  ORDER BY s.created_at DESC
  LIMIT 1
),
web AS (
  SELECT p.id,
         p.supplier_code,
         p.source_url,
         p.normalized_payload,
         l.canonical_variant_id
  FROM public.catalog_source_products p
  JOIN latest_web_snapshot s ON s.id=p.snapshot_id
  JOIN public.catalog_source_product_links l
    ON l.source_product_id=p.id
   AND l.link_status='approved'
),
combine_edges AS (
  SELECT DISTINCT
         w.id AS source_product_id,
         w.canonical_variant_id AS subject_canonical_variant_id,
         w.source_url,
         w.normalized_payload->'attributes'->>'ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ' AS raw_value,
         btrim(token) AS target_reference
  FROM web w
  CROSS JOIN LATERAL regexp_split_to_table(
    coalesce(w.normalized_payload->'attributes'->>'ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ',''),
    '\s*[,;|]\s*'
  ) token
  WHERE btrim(token)<>''
),
resolved AS (
  SELECT e.*,
         tw.canonical_variant_id AS target_canonical_variant_id
  FROM combine_edges e
  LEFT JOIN web tw
    ON tw.supplier_code=e.target_reference
   AND tw.canonical_variant_id IS DISTINCT FROM e.subject_canonical_variant_id
)
INSERT INTO public.product_compatibility_claims(
  source_product_id,
  subject_canonical_variant_id,
  target_kind,
  target_canonical_variant_id,
  target_reference,
  relationship_type,
  evidence_level,
  review_status,
  confidence,
  source_reference,
  evidence
)
SELECT r.source_product_id,
       r.subject_canonical_variant_id,
       CASE WHEN r.target_canonical_variant_id IS NOT NULL THEN 'canonical_variant' ELSE 'external_model' END,
       r.target_canonical_variant_id,
       CASE WHEN r.target_canonical_variant_id IS NULL THEN r.target_reference ELSE NULL END,
       'works_with',
       'explicit',
       'candidate',
       CASE WHEN r.target_canonical_variant_id IS NOT NULL THEN 0.99 ELSE 0.95 END,
       r.source_url,
       jsonb_build_object(
         'basis','explicit supplier attribute ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ',
         'sourceAttribute','ΣΥΝΔΥΑΖΕΤΑΙ ΜΕ',
         'rawValue',r.raw_value,
         'targetReference',r.target_reference,
         'targetResolution',CASE WHEN r.target_canonical_variant_id IS NOT NULL THEN 'exact_supplier_code' ELSE 'unresolved_reference' END,
         'importerVersion','fournarakis-web-relationships-v1'
       )
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_compatibility_claims x
  WHERE x.source_product_id=r.source_product_id
    AND x.subject_canonical_variant_id=r.subject_canonical_variant_id
    AND x.relationship_type='works_with'
    AND x.review_status<>'superseded'
    AND (
      (r.target_canonical_variant_id IS NOT NULL
       AND x.target_kind='canonical_variant'
       AND x.target_canonical_variant_id=r.target_canonical_variant_id)
      OR
      (r.target_canonical_variant_id IS NULL
       AND x.target_kind='external_model'
       AND x.target_reference=r.target_reference)
    )
);

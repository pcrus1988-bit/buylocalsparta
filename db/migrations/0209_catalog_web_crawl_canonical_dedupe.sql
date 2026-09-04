BEGIN;

-- Extend the existing Shopify-specific crawl promotion preparation with generic
-- canonical-source de-duplication and conservative UI/form attribute sanitation.
-- Raw rejected rows remain stored as crawl evidence; only accepted promotion
-- candidates are normalized before the immutable Supplier PIM bridge runs.
ALTER FUNCTION bls_private.prepare_catalog_web_crawl_promotion(uuid)
  RENAME TO prepare_catalog_web_crawl_promotion_shopify_v1;

REVOKE ALL ON FUNCTION bls_private.prepare_catalog_web_crawl_promotion_shopify_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.prepare_catalog_web_crawl_promotion_shopify_v1(uuid) TO bls_platform_runtime;

CREATE FUNCTION bls_private.prepare_catalog_web_crawl_promotion(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions', 'bls_private'
AS $$
DECLARE
  v_base jsonb;
  v_attribute_rows integer := 0;
  v_variant_attribute_rows integer := 0;
  v_canonical_duplicates integer := 0;
  v_remaining integer := 0;
BEGIN
  v_base := bls_private.prepare_catalog_web_crawl_promotion_shopify_v1(p_job_id);

  -- Remove obvious storefront controls that generic HTML extraction can mistake
  -- for catalogue attributes. Preserve every removed key/value in quality_payload.
  WITH sanitized AS (
    SELECT
      e.id,
      COALESCE(
        jsonb_object_agg(a.key, a.value) FILTER (
          WHERE NOT (
            lower(a.key) ~ '(gdpr|privacy|consent|cookie|e-?mail|newsletter|subscribe|subscription|notify|notification|quantity|qty|αποδοχ|απορρη|ενημερω|ειδοπο)'
            OR lower(a.value) ~ '(privacy policy|cookie policy|e-?mail:?$|newsletter|subscribe|αποδεχομαι|αποδέχομαι|πολιτικ.{0,3}απορρη|πολιτική.{0,3}απορρή)'
          )
        ),
        '{}'::jsonb
      ) AS cleaned,
      COALESCE(
        jsonb_object_agg(a.key, a.value) FILTER (
          WHERE (
            lower(a.key) ~ '(gdpr|privacy|consent|cookie|e-?mail|newsletter|subscribe|subscription|notify|notification|quantity|qty|αποδοχ|απορρη|ενημερω|ειδοπο)'
            OR lower(a.value) ~ '(privacy policy|cookie policy|e-?mail:?$|newsletter|subscribe|αποδεχομαι|αποδέχομαι|πολιτικ.{0,3}απορρη|πολιτική.{0,3}απορρή)'
          )
        ),
        '{}'::jsonb
      ) AS removed
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    CROSS JOIN LATERAL jsonb_each_text(e.extracted_payload->'attributes') AS a(key,value)
    WHERE p.job_id=p_job_id
      AND e.status='accepted'
      AND jsonb_typeof(e.extracted_payload->'attributes')='object'
    GROUP BY e.id
  )
  UPDATE public.catalog_web_product_extractions e
  SET extracted_payload=jsonb_set(e.extracted_payload,'{attributes}',s.cleaned,true),
      quality_payload=COALESCE(e.quality_payload,'{}'::jsonb) || jsonb_build_object(
        'promotionAttributeSanitization',
        COALESCE(e.quality_payload->'promotionAttributeSanitization','{}'::jsonb)
          || jsonb_build_object('removedAttributes',s.removed)
      ),
      updated_at=now()
  FROM sanitized s
  WHERE e.id=s.id AND s.removed<>'{}'::jsonb;
  GET DIAGNOSTICS v_attribute_rows=ROW_COUNT;

  WITH sanitized AS (
    SELECT
      e.id,
      COALESCE(
        jsonb_object_agg(a.key, a.value) FILTER (
          WHERE NOT (
            lower(a.key) ~ '(gdpr|privacy|consent|cookie|e-?mail|newsletter|subscribe|subscription|notify|notification|quantity|qty|αποδοχ|απορρη|ενημερω|ειδοπο)'
            OR lower(a.value) ~ '(privacy policy|cookie policy|e-?mail:?$|newsletter|subscribe|αποδεχομαι|αποδέχομαι|πολιτικ.{0,3}απορρη|πολιτική.{0,3}απορρή)'
          )
        ),
        '{}'::jsonb
      ) AS cleaned,
      COALESCE(
        jsonb_object_agg(a.key, a.value) FILTER (
          WHERE (
            lower(a.key) ~ '(gdpr|privacy|consent|cookie|e-?mail|newsletter|subscribe|subscription|notify|notification|quantity|qty|αποδοχ|απορρη|ενημερω|ειδοπο)'
            OR lower(a.value) ~ '(privacy policy|cookie policy|e-?mail:?$|newsletter|subscribe|αποδεχομαι|αποδέχομαι|πολιτικ.{0,3}απορρη|πολιτική.{0,3}απορρή)'
          )
        ),
        '{}'::jsonb
      ) AS removed
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    CROSS JOIN LATERAL jsonb_each_text(e.extracted_payload->'variantAttributes') AS a(key,value)
    WHERE p.job_id=p_job_id
      AND e.status='accepted'
      AND jsonb_typeof(e.extracted_payload->'variantAttributes')='object'
    GROUP BY e.id
  )
  UPDATE public.catalog_web_product_extractions e
  SET extracted_payload=jsonb_set(e.extracted_payload,'{variantAttributes}',s.cleaned,true),
      quality_payload=COALESCE(e.quality_payload,'{}'::jsonb) || jsonb_build_object(
        'promotionAttributeSanitization',
        COALESCE(e.quality_payload->'promotionAttributeSanitization','{}'::jsonb)
          || jsonb_build_object('removedVariantAttributes',s.removed)
      ),
      updated_at=now()
  FROM sanitized s
  WHERE e.id=s.id AND s.removed<>'{}'::jsonb;
  GET DIAGNOSTICS v_variant_attribute_rows=ROW_COUNT;

  -- A generic storefront may expose one product through multiple route aliases.
  -- Resolve only duplicates whose extracted canonical source URL agrees and where:
  --   (a) strong identities agree and normalized titles are identical, or
  --   (b) exactly one structured candidate dominates only weak anonymous HTML rows.
  -- Conflicting SKUs/GTINs/MPNs remain untouched and continue to block promotion.
  WITH candidates AS (
    SELECT
      e.id,
      e.source_product_key,
      e.confidence,
      e.extracted_payload,
      e.field_provenance,
      lower(rtrim(split_part(
        COALESCE(NULLIF(btrim(e.extracted_payload->>'sourceUrl'),''),p.normalized_url),
        '#',1
      ),'/')) AS canonical_source_url,
      lower(regexp_replace(btrim(COALESCE(e.extracted_payload->>'title','')),'\s+',' ','g')) AS title_key,
      NULLIF(lower(btrim(e.extracted_payload->>'sku')),'') AS sku_key,
      NULLIF(lower(btrim(e.extracted_payload->>'gtin')),'') AS gtin_key,
      NULLIF(lower(btrim(e.extracted_payload->>'mpn')),'') AS mpn_key,
      lower(COALESCE(
        CASE
          WHEN jsonb_typeof(e.field_provenance->'title')='array'
            THEN e.field_provenance#>>'{title,0,origin}'
          ELSE e.field_provenance#>>'{title,origin}'
        END,
        ''
      )) AS title_origin
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id
      AND e.status='accepted'
  ),
  grouped AS (
    SELECT
      source_product_key,
      canonical_source_url,
      count(*) AS row_count,
      count(DISTINCT sku_key) AS sku_count,
      count(DISTINCT gtin_key) AS gtin_count,
      count(DISTINCT mpn_key) AS mpn_count,
      count(DISTINCT title_key) AS title_count,
      bool_or(sku_key IS NOT NULL OR gtin_key IS NOT NULL OR mpn_key IS NOT NULL) AS has_strong_identity,
      count(*) FILTER (WHERE title_origin IN ('json_ld','api','microdata')) AS structured_count,
      count(*) FILTER (
        WHERE title_origin='html'
          AND sku_key IS NULL AND gtin_key IS NULL AND mpn_key IS NULL
          AND (
            jsonb_typeof(extracted_payload->'prices') IS DISTINCT FROM 'array'
            OR jsonb_array_length(extracted_payload->'prices')=0
          )
      ) AS weak_html_count
    FROM candidates
    WHERE canonical_source_url<>''
    GROUP BY source_product_key,canonical_source_url
    HAVING count(*)>1
  ),
  eligible AS (
    SELECT *
    FROM grouped
    WHERE sku_count<=1 AND gtin_count<=1 AND mpn_count<=1
      AND (
        (has_strong_identity AND title_count=1)
        OR (structured_count=1 AND weak_html_count=row_count-1)
      )
  ),
  ranked AS (
    SELECT
      c.id,
      c.source_product_key,
      c.canonical_source_url,
      first_value(c.id) OVER (
        PARTITION BY c.source_product_key,c.canonical_source_url
        ORDER BY
          CASE c.title_origin
            WHEN 'json_ld' THEN 0
            WHEN 'api' THEN 1
            WHEN 'microdata' THEN 2
            ELSE 3
          END,
          CASE
            WHEN jsonb_typeof(c.extracted_payload->'prices')='array'
              AND jsonb_array_length(c.extracted_payload->'prices')>0 THEN 0
            ELSE 1
          END,
          CASE
            WHEN jsonb_typeof(c.extracted_payload->'images')='array'
              AND jsonb_array_length(c.extracted_payload->'images')>0 THEN 0
            ELSE 1
          END,
          CASE
            WHEN jsonb_typeof(c.extracted_payload->'categoryPath')='array'
              THEN jsonb_array_length(c.extracted_payload->'categoryPath')
            ELSE 0
          END DESC,
          c.confidence DESC,
          c.id
      ) AS winner_id,
      row_number() OVER (
        PARTITION BY c.source_product_key,c.canonical_source_url
        ORDER BY
          CASE c.title_origin
            WHEN 'json_ld' THEN 0
            WHEN 'api' THEN 1
            WHEN 'microdata' THEN 2
            ELSE 3
          END,
          CASE
            WHEN jsonb_typeof(c.extracted_payload->'prices')='array'
              AND jsonb_array_length(c.extracted_payload->'prices')>0 THEN 0
            ELSE 1
          END,
          CASE
            WHEN jsonb_typeof(c.extracted_payload->'images')='array'
              AND jsonb_array_length(c.extracted_payload->'images')>0 THEN 0
            ELSE 1
          END,
          CASE
            WHEN jsonb_typeof(c.extracted_payload->'categoryPath')='array'
              THEN jsonb_array_length(c.extracted_payload->'categoryPath')
            ELSE 0
          END DESC,
          c.confidence DESC,
          c.id
      ) AS rn
    FROM candidates c
    JOIN eligible g
      ON g.source_product_key=c.source_product_key
     AND g.canonical_source_url=c.canonical_source_url
  )
  UPDATE public.catalog_web_product_extractions e
  SET status='rejected',
      rejection_reason='duplicate_same_canonical_source_url',
      quality_payload=COALESCE(e.quality_payload,'{}'::jsonb) || jsonb_build_object(
        'promotionCanonicalDecision',
        jsonb_build_object(
          'reason','duplicate_same_canonical_source_url',
          'keptAsEvidence',true,
          'winnerExtractionId',r.winner_id,
          'canonicalSourceUrl',r.canonical_source_url
        )
      ),
      updated_at=now()
  FROM ranked r
  WHERE e.id=r.id AND r.rn>1;
  GET DIAGNOSTICS v_canonical_duplicates=ROW_COUNT;

  SELECT count(DISTINCT e.source_product_key)::integer INTO v_remaining
  FROM public.catalog_web_product_extractions e
  JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
  WHERE p.job_id=p_job_id AND e.status IN ('accepted','promoted');

  RETURN v_base || jsonb_build_object(
    'uiAttributeRowsSanitized',v_attribute_rows,
    'uiVariantAttributeRowsSanitized',v_variant_attribute_rows,
    'canonicalDuplicatesRejected',v_canonical_duplicates,
    'promotionProductKeys',v_remaining,
    'strategy','canonical_source_url_v2'
  );
END;
$$;

REVOKE ALL ON FUNCTION bls_private.prepare_catalog_web_crawl_promotion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.prepare_catalog_web_crawl_promotion(uuid) TO bls_platform_runtime;

COMMIT;

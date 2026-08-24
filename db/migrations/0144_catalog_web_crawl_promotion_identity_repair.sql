BEGIN;

-- Preserve the original audited promotion implementation behind a private v1 name.
ALTER FUNCTION bls_private.promote_catalog_web_crawl_job(uuid)
  RENAME TO promote_catalog_web_crawl_job_v1;

REVOKE ALL ON FUNCTION bls_private.promote_catalog_web_crawl_job_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.promote_catalog_web_crawl_job_v1(uuid) TO bls_platform_runtime;

-- Repair URL aliases and weak identifiers before immutable Supplier PIM promotion.
-- Shopify-style collection URLs expose the same product under many routes. The URL
-- product handle is a stronger source identity than an SKU/MPN accidentally picked
-- from a related-products block. Raw evidence is preserved in quality_payload.
CREATE FUNCTION bls_private.prepare_catalog_web_crawl_promotion(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions', 'bls_private'
AS $$
DECLARE
  v_rekeyed integer := 0;
  v_sku_cleared integer := 0;
  v_mpn_cleared integer := 0;
  v_aliases_rejected integer := 0;
  v_remaining integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_web_crawl_jobs j
    WHERE j.id=p_job_id AND j.status IN ('succeeded','partial')
  ) THEN
    RAISE EXCEPTION 'Catalogue web crawl job must be succeeded or partial before PIM promotion';
  END IF;

  WITH mapped AS (
    SELECT
      e.id,
      e.source_product_key AS original_key,
      NULLIF(btrim(e.extracted_payload->>'sku'),'') AS original_sku,
      NULLIF(btrim(e.extracted_payload->>'mpn'),'') AS original_mpn,
      lower(regexp_replace(split_part(split_part(p.normalized_url,'://',2),'/',1),'^www\\.','','i'))
        || '/products/' || lower((regexp_match(
          p.normalized_url,
          '^https?://[^/]+/(?:collections/[^/]+/)?products/([^/?#]+)',
          'i'
        ))[1]) AS canonical_identity
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id
      AND e.status='accepted'
      AND p.normalized_url ~* '^https?://[^/]+/(?:collections/[^/]+/)?products/[^/?#]+'
  ), keyed AS (
    SELECT
      m.*,
      'weburl:' || encode(digest(convert_to(m.canonical_identity,'UTF8'),'sha256'),'hex') AS repaired_key
    FROM mapped m
    WHERE m.canonical_identity IS NOT NULL
  )
  UPDATE public.catalog_web_product_extractions e
  SET source_product_key=k.repaired_key,
      quality_payload=COALESCE(e.quality_payload,'{}'::jsonb) || jsonb_build_object(
        'promotionIdentityRepair',
        jsonb_strip_nulls(jsonb_build_object(
          'method','canonical_product_url',
          'canonicalProductIdentity',k.canonical_identity,
          'originalSourceProductKey',COALESCE(
            e.quality_payload#>>'{promotionIdentityRepair,originalSourceProductKey}',
            k.original_key
          ),
          'originalSku',COALESCE(
            e.quality_payload#>>'{promotionIdentityRepair,originalSku}',
            k.original_sku
          ),
          'originalMpn',COALESCE(
            e.quality_payload#>>'{promotionIdentityRepair,originalMpn}',
            k.original_mpn
          )
        ))
      ),
      updated_at=now()
  FROM keyed k
  WHERE e.id=k.id
    AND e.source_product_key IS DISTINCT FROM k.repaired_key;
  GET DIAGNOSTICS v_rekeyed=ROW_COUNT;

  -- If one purported SKU is observed on several distinct product URLs in the same
  -- crawl it is not safe identity evidence. Keep the original value in the quality
  -- audit payload but remove it from normalized promotion data.
  WITH bad_skus AS (
    SELECT lower(btrim(e.extracted_payload->>'sku')) AS identifier
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id
      AND e.status='accepted'
      AND e.source_product_key LIKE 'weburl:%'
      AND NULLIF(btrim(e.extracted_payload->>'sku'),'') IS NOT NULL
    GROUP BY lower(btrim(e.extracted_payload->>'sku'))
    HAVING count(DISTINCT e.source_product_key)>1
  )
  UPDATE public.catalog_web_product_extractions e
  SET quality_payload=COALESCE(e.quality_payload,'{}'::jsonb) || jsonb_build_object(
        'promotionSkuConflict',jsonb_build_object(
          'value',e.extracted_payload->>'sku',
          'reason','identifier_seen_on_multiple_product_urls'
        )
      ),
      extracted_payload=e.extracted_payload-'sku',
      updated_at=now()
  FROM public.catalog_web_crawl_pages p,bad_skus b
  WHERE p.id=e.page_id
    AND p.job_id=p_job_id
    AND e.status='accepted'
    AND lower(btrim(e.extracted_payload->>'sku'))=b.identifier;
  GET DIAGNOSTICS v_sku_cleared=ROW_COUNT;

  WITH bad_mpns AS (
    SELECT lower(btrim(e.extracted_payload->>'mpn')) AS identifier
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id
      AND e.status='accepted'
      AND e.source_product_key LIKE 'weburl:%'
      AND NULLIF(btrim(e.extracted_payload->>'mpn'),'') IS NOT NULL
    GROUP BY lower(btrim(e.extracted_payload->>'mpn'))
    HAVING count(DISTINCT e.source_product_key)>1
  )
  UPDATE public.catalog_web_product_extractions e
  SET quality_payload=COALESCE(e.quality_payload,'{}'::jsonb) || jsonb_build_object(
        'promotionMpnConflict',jsonb_build_object(
          'value',e.extracted_payload->>'mpn',
          'reason','identifier_seen_on_multiple_product_urls'
        )
      ),
      extracted_payload=e.extracted_payload-'mpn',
      updated_at=now()
  FROM public.catalog_web_crawl_pages p,bad_mpns b
  WHERE p.id=e.page_id
    AND p.job_id=p_job_id
    AND e.status='accepted'
    AND lower(btrim(e.extracted_payload->>'mpn'))=b.identifier;
  GET DIAGNOSTICS v_mpn_cleared=ROW_COUNT;

  -- Keep one best evidence row per canonical product URL. Prefer the canonical
  -- /products/<handle> page, then a canonical variant URL, then collection aliases.
  -- Rejected rows remain stored as immutable crawl evidence and are never deleted.
  WITH ranked AS (
    SELECT
      e.id,
      e.source_product_key,
      row_number() OVER (
        PARTITION BY e.source_product_key
        ORDER BY
          CASE
            WHEN p.normalized_url ~* '^https?://[^/]+/products/[^/?#]+$' THEN 0
            WHEN p.normalized_url ~* '^https?://[^/]+/products/[^/?#]+\\?variant=[0-9]+' THEN 1
            WHEN p.normalized_url ~* '^https?://[^/]+/collections/[^/]+/products/[^/?#]+$' THEN 2
            ELSE 3
          END,
          e.confidence DESC,
          e.id
      ) AS rn
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id
      AND e.status='accepted'
      AND e.source_product_key LIKE 'weburl:%'
  )
  UPDATE public.catalog_web_product_extractions e
  SET status='rejected',
      quality_payload=COALESCE(e.quality_payload,'{}'::jsonb) || jsonb_build_object(
        'promotionAliasDecision',jsonb_build_object(
          'reason','duplicate_canonical_product_url',
          'keptAsEvidence',true
        )
      ),
      updated_at=now()
  FROM ranked r
  WHERE e.id=r.id AND r.rn>1;
  GET DIAGNOSTICS v_aliases_rejected=ROW_COUNT;

  SELECT count(DISTINCT e.source_product_key)::integer INTO v_remaining
  FROM public.catalog_web_product_extractions e
  JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
  WHERE p.job_id=p_job_id AND e.status IN ('accepted','promoted');

  RETURN jsonb_build_object(
    'identityRowsRekeyed',v_rekeyed,
    'unsafeSkuRowsCleared',v_sku_cleared,
    'unsafeMpnRowsCleared',v_mpn_cleared,
    'duplicateAliasRowsRejected',v_aliases_rejected,
    'promotionProductKeys',v_remaining,
    'strategy','canonical_product_url_v1'
  );
END;
$$;

REVOKE ALL ON FUNCTION bls_private.prepare_catalog_web_crawl_promotion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.prepare_catalog_web_crawl_promotion(uuid) TO bls_platform_runtime;

-- Keep the public-to-runtime contract name stable. Every caller now receives the
-- identity repair before the original immutable PIM promotion transaction runs.
CREATE FUNCTION bls_private.promote_catalog_web_crawl_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions', 'bls_private'
AS $$
DECLARE
  v_preparation jsonb;
  v_result jsonb;
BEGIN
  v_preparation:=bls_private.prepare_catalog_web_crawl_promotion(p_job_id);
  v_result:=bls_private.promote_catalog_web_crawl_job_v1(p_job_id);
  RETURN v_result || jsonb_build_object('promotionPreparation',v_preparation);
END;
$$;

REVOKE ALL ON FUNCTION bls_private.promote_catalog_web_crawl_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.promote_catalog_web_crawl_job(uuid) TO bls_platform_runtime;

COMMIT;

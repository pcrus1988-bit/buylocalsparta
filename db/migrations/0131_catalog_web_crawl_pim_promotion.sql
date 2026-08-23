-- Buy Local Sparta — promote accepted web-crawl evidence into the immutable supplier PIM.
-- This is the only crawler-to-catalogue bridge. No public product, vendor offer or inventory row is created here.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.promote_catalog_web_crawl_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,public,extensions,bls_private
AS $$
DECLARE
  v_job public.catalog_web_crawl_jobs%ROWTYPE;
  v_source public.catalog_sources%ROWTYPE;
  v_snapshot_id uuid;
  v_source_hash text;
  v_row record;
  v_source_product_id uuid;
  v_leaf_taxonomy_id uuid;
  v_parent_taxonomy_id uuid;
  v_existing_taxonomy_id uuid;
  v_path_labels text[];
  v_path_keys text[];
  v_prefix text[];
  v_label text;
  v_taxonomy_key text;
  v_depth integer;
  v_promoted integer:=0;
  v_prices integer:=0;
  v_attributes integer:=0;
  v_taxonomy_nodes integer:=0;
  v_product_count integer:=0;
  v_reused_snapshot boolean:=false;
  v_price record;
  v_inserted integer:=0;
BEGIN
  SELECT * INTO v_job
  FROM public.catalog_web_crawl_jobs
  WHERE id=p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Catalogue web crawl job was not found'; END IF;
  IF v_job.status NOT IN ('succeeded','partial') THEN
    RAISE EXCEPTION 'Catalogue web crawl job must be succeeded or partial before PIM promotion';
  END IF;

  SELECT * INTO v_source
  FROM public.catalog_sources
  WHERE id=v_job.source_id AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active catalogue source for crawl job was not found'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id AND e.status IN ('accepted','promoted')
    GROUP BY e.source_product_key
    HAVING count(DISTINCT e.extracted_payload)>1
  ) THEN
    RAISE EXCEPTION 'Crawl source product key collision requires review before promotion';
  END IF;

  SELECT count(DISTINCT e.source_product_key)::integer INTO v_product_count
  FROM public.catalog_web_product_extractions e
  JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
  WHERE p.job_id=p_job_id AND e.status IN ('accepted','promoted');
  IF v_product_count=0 THEN RAISE EXCEPTION 'Catalogue web crawl job has no accepted product extractions to promote'; END IF;

  SELECT encode(digest(convert_to(string_agg(
    x.source_product_key||':'||encode(digest(convert_to(x.extracted_payload::text,'UTF8'),'sha256'),'hex'),
    E'\n' ORDER BY x.source_product_key
  ),'UTF8'),'sha256'),'hex')
  INTO v_source_hash
  FROM (
    SELECT DISTINCT ON (e.source_product_key) e.source_product_key,e.extracted_payload
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id AND e.status IN ('accepted','promoted')
    ORDER BY e.source_product_key,e.confidence DESC,e.id
  ) x;

  SELECT css.id INTO v_snapshot_id
  FROM public.catalog_source_snapshots css
  WHERE css.source_id=v_job.source_id AND css.source_hash=v_source_hash
  LIMIT 1;

  IF v_snapshot_id IS NULL THEN
    INSERT INTO public.catalog_source_snapshots(
      source_id,source_filename,source_hash,source_version,observed_at,row_count,metadata
    ) VALUES(
      v_job.source_id,'web-crawl:'||p_job_id::text,v_source_hash,v_job.extractor_version,
      COALESCE(v_job.completed_at,now()),v_product_count,
      jsonb_build_object('origin','web_crawl','crawlJobId',p_job_id,'crawlProfileId',v_job.profile_id,
        'crawlMode',v_job.crawl_mode,'promotionVersion','web-crawl-pim-v1')
    ) RETURNING id INTO v_snapshot_id;
  ELSE
    v_reused_snapshot:=true;
  END IF;

  FOR v_row IN
    SELECT DISTINCT ON (e.source_product_key)
      e.source_product_key,e.extracted_payload,e.field_provenance,e.quality_payload,e.confidence,
      p.url AS crawl_url,p.normalized_url,p.response_sha256,p.fetched_at
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id AND e.status IN ('accepted','promoted')
    ORDER BY e.source_product_key,e.confidence DESC,e.id
  LOOP
    v_source_product_id:=NULL;
    v_leaf_taxonomy_id:=NULL;
    v_parent_taxonomy_id:=NULL;
    v_path_keys:=ARRAY[]::text[];

    SELECT COALESCE(array_agg(value ORDER BY ordinality),ARRAY[]::text[])
    INTO v_path_labels
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_row.extracted_payload->'categoryPath')='array'
      THEN v_row.extracted_payload->'categoryPath' ELSE '[]'::jsonb END)
      WITH ORDINALITY AS path(value,ordinality)
    WHERE btrim(value)<>'';

    IF cardinality(v_path_labels)>0 THEN
      FOR v_depth IN 1..cardinality(v_path_labels) LOOP
        v_prefix:=v_path_labels[1:v_depth];
        v_label:=v_path_labels[v_depth];
        v_existing_taxonomy_id:=NULL;
        v_taxonomy_key:=NULL;

        SELECT n.id,n.source_key INTO v_existing_taxonomy_id,v_taxonomy_key
        FROM public.catalog_source_taxonomy_nodes n
        WHERE n.source_id=v_job.source_id AND n.depth=v_depth-1 AND n.path_labels=v_prefix
        ORDER BY n.created_at,n.id LIMIT 1;

        IF v_existing_taxonomy_id IS NULL THEN
          v_taxonomy_key:='crawl-path-'||left(encode(digest(
            convert_to(array_to_string(v_prefix,E'\\x1f'),'UTF8'),'sha256'),'hex'),32);
          v_path_keys:=array_append(v_path_keys,v_taxonomy_key);
          INSERT INTO public.catalog_source_taxonomy_nodes(
            source_id,parent_id,source_key,source_label,depth,path_labels,path_keys,source_url,metadata
          ) VALUES(
            v_job.source_id,v_parent_taxonomy_id,v_taxonomy_key,v_label,v_depth-1,v_prefix,v_path_keys,
            v_row.normalized_url,jsonb_build_object('origin','web_crawl','promotionVersion','web-crawl-pim-v1')
          ) ON CONFLICT (source_id,source_key) DO UPDATE
            SET source_label=EXCLUDED.source_label,
                source_url=COALESCE(public.catalog_source_taxonomy_nodes.source_url,EXCLUDED.source_url),
                updated_at=now()
          RETURNING id INTO v_existing_taxonomy_id;
          v_taxonomy_nodes:=v_taxonomy_nodes+1;
        ELSE
          v_path_keys:=array_append(v_path_keys,v_taxonomy_key);
        END IF;
        v_parent_taxonomy_id:=v_existing_taxonomy_id;
        v_leaf_taxonomy_id:=v_existing_taxonomy_id;
      END LOOP;
    END IF;

    INSERT INTO public.catalog_source_products(
      snapshot_id,source_id,source_taxonomy_node_id,source_product_key,supplier_code,title,source_url,
      source_image_url,source_identity,raw_payload,normalized_payload,quality_payload,price_state,classification_status
    ) VALUES(
      v_snapshot_id,v_job.source_id,v_leaf_taxonomy_id,v_row.source_product_key,
      NULLIF(btrim(v_row.extracted_payload->>'sku'),''),
      COALESCE(NULLIF(btrim(v_row.extracted_payload->>'title'),''),v_row.source_product_key),
      COALESCE(NULLIF(btrim(v_row.extracted_payload->>'sourceUrl'),''),v_row.normalized_url),
      NULLIF(btrim(v_row.extracted_payload#>>'{images,0,url}'),''),
      jsonb_strip_nulls(jsonb_build_object(
        'brand',NULLIF(btrim(v_row.extracted_payload->>'brand'),''),'model',NULLIF(btrim(v_row.extracted_payload->>'model'),''),
        'mpn',NULLIF(btrim(v_row.extracted_payload->>'mpn'),''),'gtin',NULLIF(btrim(v_row.extracted_payload->>'gtin'),''),
        'sku',NULLIF(btrim(v_row.extracted_payload->>'sku'),''),'sourceProductKey',v_row.source_product_key)),
      jsonb_build_object('extracted',v_row.extracted_payload,'fieldProvenance',v_row.field_provenance,
        'crawlEvidence',jsonb_strip_nulls(jsonb_build_object('crawlJobId',p_job_id,'pageUrl',v_row.crawl_url,
          'normalizedUrl',v_row.normalized_url,'responseSha256',v_row.response_sha256,'fetchedAt',v_row.fetched_at))),
      jsonb_strip_nulls(jsonb_build_object(
        'supplierDescription',NULLIF(btrim(v_row.extracted_payload->>'description'),''),
        'attributes',COALESCE(v_row.extracted_payload->'attributes','{}'::jsonb),
        'variantAttributes',COALESCE(v_row.extracted_payload->'variantAttributes','{}'::jsonb),
        'categoryPath',COALESCE(v_row.extracted_payload->'categoryPath','[]'::jsonb),
        'images',COALESCE(v_row.extracted_payload->'images','[]'::jsonb),
        'prices',COALESCE(v_row.extracted_payload->'prices','[]'::jsonb),
        'gtin',NULLIF(btrim(v_row.extracted_payload->>'gtin'),''),'mpn',NULLIF(btrim(v_row.extracted_payload->>'mpn'),''),
        'sku',NULLIF(btrim(v_row.extracted_payload->>'sku'),''))),
      COALESCE(v_row.quality_payload,'{}'::jsonb)||jsonb_build_object(
        'crawlExtractionConfidence',v_row.confidence,'fieldProvenance',v_row.field_provenance,'promotionVersion','web-crawl-pim-v1'),
      CASE WHEN jsonb_typeof(v_row.extracted_payload->'prices')='array'
        AND jsonb_array_length(v_row.extracted_payload->'prices')>0 THEN 'matched' ELSE 'unpriced' END,
      CASE WHEN v_leaf_taxonomy_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM public.catalog_source_category_mappings m
        WHERE m.source_taxonomy_node_id=v_leaf_taxonomy_id AND m.mapping_status='approved'
      ) THEN 'mapped' ELSE 'raw' END
    ) ON CONFLICT (snapshot_id,source_product_key) DO NOTHING
    RETURNING id INTO v_source_product_id;

    IF v_source_product_id IS NULL THEN
      SELECT id INTO v_source_product_id
      FROM public.catalog_source_products
      WHERE snapshot_id=v_snapshot_id AND source_product_key=v_row.source_product_key;
    END IF;
    IF v_source_product_id IS NULL THEN
      RAISE EXCEPTION 'Unable to resolve immutable catalogue source product after promotion';
    END IF;

    INSERT INTO public.catalog_source_attribute_observations(
      source_product_id,source_attribute_key,position,raw_value,normalized_value,mapping_status,confidence,metadata
    ) SELECT v_source_product_id,a.key,0,to_jsonb(a.value),to_jsonb(a.value),'unmapped',v_row.confidence,
      jsonb_build_object('origin','web_crawl','evidence',COALESCE(v_row.field_provenance->a.key,'{}'::jsonb),
        'promotionVersion','web-crawl-pim-v1')
    FROM jsonb_each_text(COALESCE(v_row.extracted_payload->'attributes','{}'::jsonb)
      ||COALESCE(v_row.extracted_payload->'variantAttributes','{}'::jsonb)) a
    ON CONFLICT (source_product_id,source_attribute_key,position) DO NOTHING;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    v_attributes:=v_attributes+v_inserted;

    FOR v_price IN
      SELECT price.value AS payload,price.ordinality::integer AS ordinal
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_row.extracted_payload->'prices')='array'
        THEN v_row.extracted_payload->'prices' ELSE '[]'::jsonb END)
        WITH ORDINALITY AS price(value,ordinality)
    LOOP
      IF (v_price.payload->>'amountMinor')~'^[0-9]+$' AND (v_price.payload->>'currency')~'^[A-Z]{3}$' THEN
        INSERT INTO public.catalog_price_observations(
          source_product_id,amount_minor,currency,tax_inclusive,price_kind,observation_status,match_method,
          confidence,source_reference,observed_at,metadata
        ) SELECT v_source_product_id,(v_price.payload->>'amountMinor')::bigint,(v_price.payload->>'currency')::char(3),
          CASE WHEN jsonb_typeof(v_price.payload->'taxInclusive')='boolean' THEN (v_price.payload->>'taxInclusive')::boolean ELSE NULL END,
          CASE COALESCE(v_price.payload->>'kind','unknown') WHEN 'selling' THEN 'offer' WHEN 'rrp' THEN 'rrp'
            WHEN 'promotion' THEN 'promotion' WHEN 'catalogue' THEN 'catalogue' ELSE 'unknown' END,
          'observed','web_crawl',v_row.confidence,
          COALESCE(NULLIF(v_price.payload#>>'{evidence,sourceUrl}',''),v_row.normalized_url),
          COALESCE(v_row.fetched_at,v_job.completed_at,v_job.created_at),
          jsonb_build_object('origin','web_crawl','crawlJobId',p_job_id,'priceOrdinal',v_price.ordinal,
            'evidence',COALESCE(v_price.payload->'evidence','{}'::jsonb))
        WHERE NOT EXISTS(
          SELECT 1 FROM public.catalog_price_observations existing
          WHERE existing.source_product_id=v_source_product_id
            AND existing.amount_minor=(v_price.payload->>'amountMinor')::bigint
            AND existing.currency=(v_price.payload->>'currency')::char(3)
            AND existing.price_kind=CASE COALESCE(v_price.payload->>'kind','unknown') WHEN 'selling' THEN 'offer'
              WHEN 'rrp' THEN 'rrp' WHEN 'promotion' THEN 'promotion' WHEN 'catalogue' THEN 'catalogue' ELSE 'unknown' END
            AND existing.source_reference=COALESCE(NULLIF(v_price.payload#>>'{evidence,sourceUrl}',''),v_row.normalized_url)
        );
        GET DIAGNOSTICS v_inserted=ROW_COUNT;
        v_prices:=v_prices+v_inserted;
      END IF;
    END LOOP;

    UPDATE public.catalog_web_product_extractions e
    SET status='promoted',promoted_source_product_id=v_source_product_id,
        promoted_at=COALESCE(e.promoted_at,now()),updated_at=now()
    FROM public.catalog_web_crawl_pages p
    WHERE e.page_id=p.id AND p.job_id=p_job_id AND e.source_product_key=v_row.source_product_key
      AND e.status IN ('accepted','promoted');
    v_promoted:=v_promoted+1;
  END LOOP;

  INSERT INTO public.catalog_source_taxonomy_observations(snapshot_id,source_taxonomy_node_id,product_count,metadata)
  SELECT v_snapshot_id,p.source_taxonomy_node_id,count(*)::integer,
    jsonb_build_object('origin','web_crawl','crawlJobId',p_job_id)
  FROM public.catalog_source_products p
  WHERE p.snapshot_id=v_snapshot_id AND p.source_taxonomy_node_id IS NOT NULL
  GROUP BY p.source_taxonomy_node_id
  ON CONFLICT (snapshot_id,source_taxonomy_node_id) DO UPDATE
    SET product_count=EXCLUDED.product_count,
        metadata=public.catalog_source_taxonomy_observations.metadata||EXCLUDED.metadata;

  UPDATE public.catalog_web_crawl_jobs
  SET snapshot_id=v_snapshot_id,promoted_product_count=(
    SELECT count(DISTINCT e.source_product_key)::integer
    FROM public.catalog_web_product_extractions e
    JOIN public.catalog_web_crawl_pages p ON p.id=e.page_id
    WHERE p.job_id=p_job_id AND e.status='promoted'
  ),updated_at=now()
  WHERE id=p_job_id;

  RETURN jsonb_build_object(
    'crawlJobId',p_job_id,'sourceId',v_job.source_id,'sourceCode',v_source.code,'snapshotId',v_snapshot_id,
    'sourceHash',v_source_hash,'snapshotReused',v_reused_snapshot,'promotedProducts',v_promoted,
    'taxonomyNodesCreated',v_taxonomy_nodes,'attributeObservationsInserted',v_attributes,
    'priceObservationsInserted',v_prices,'vendorOffersCreated',0,'publicationActivated',false,
    'promotionVersion','web-crawl-pim-v1');
END;
$$;

REVOKE ALL ON FUNCTION bls_private.promote_catalog_web_crawl_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.promote_catalog_web_crawl_job(uuid) TO bls_platform_runtime;

COMMENT ON FUNCTION bls_private.promote_catalog_web_crawl_job(uuid) IS
  'Atomically promotes accepted web-crawl extractions into immutable catalog_source snapshot/product evidence, source taxonomy, attributes and price observations. It never creates vendor offers, inventory or public catalogue publication.';

COMMIT;

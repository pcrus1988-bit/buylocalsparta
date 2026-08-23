\set ON_ERROR_STOP on

INSERT INTO public.markets(code,name)
VALUES('crawl-promotion-ci','Crawl Promotion CI')
RETURNING id AS market_id \gset

INSERT INTO public.catalog_sources(market_id,code,name,source_kind,website)
VALUES(:'market_id','crawl-promotion-ci','Crawl Promotion CI Source','supplier','https://example.com/')
RETURNING id AS source_id \gset

INSERT INTO public.catalog_web_crawl_profiles(
  source_id,profile_code,root_url,allowed_hosts,fetch_mode,max_pages,max_depth,requests_per_second
)
VALUES(:'source_id','main','https://example.com/',ARRAY['example.com'],'http',100,4,5)
RETURNING id AS profile_id \gset

INSERT INTO public.catalog_web_crawl_jobs(
  profile_id,source_id,crawl_mode,seed_url,policy_snapshot,extractor_version,status,started_at,completed_at
)
VALUES(
  :'profile_id',:'source_id','single','https://example.com/p/drill-1',
  jsonb_build_object(
    'rootUrl','https://example.com/','allowedHosts',jsonb_build_array('example.com'),
    'allowSubdomains',false,'allowHttp',false,'obeyRobots',true,'fetchMode','http',
    'maxPages',100,'maxDepth',4,'maxConcurrency',1,'requestsPerSecond',5,
    'maxResponseBytes',1000000,'maxRedirects',3,'includeRules','[]'::jsonb,'excludeRules','[]'::jsonb
  ),
  'web-crawler-v1','succeeded',now(),now()
)
RETURNING id AS job_id \gset

INSERT INTO public.catalog_web_crawl_pages(
  job_id,url,normalized_url,depth,status,robots_allowed,resolved_addresses,fetch_mode,http_status,
  content_type,response_bytes,response_sha256,product_likelihood,extraction_status,fetched_at
)
VALUES(
  :'job_id','https://example.com/p/drill-1','https://example.com/p/drill-1',0,'fetched',true,
  ARRAY['93.184.216.34'::inet],'http',200,'text/html',2048,repeat('a',64),1,'extracted',now()
)
RETURNING id AS page_id \gset

INSERT INTO public.catalog_web_product_extractions(
  page_id,extraction_version,ordinal,source_product_key,status,confidence,extracted_payload,
  field_provenance,quality_payload,accepted_at
)
VALUES(
  :'page_id','web-crawler-v1',0,'DRILL-1','accepted',0.98000,
  jsonb_build_object(
    'sourceProductKey','DRILL-1','sourceUrl','https://example.com/p/drill-1','title','Test Drill 18V',
    'description','Professional 18V cordless drill with metal chuck and two speed settings.',
    'brand','Example Tools','model','DT-18','mpn','MPN-18','gtin','0195949052637','sku','DRILL-1',
    'categoryPath',jsonb_build_array('Tools','Power Tools','Drills'),
    'attributes',jsonb_build_object('voltage','18 V','material','Steel'),
    'variantAttributes',jsonb_build_object('color','Black'),
    'images',jsonb_build_array(jsonb_build_object(
      'url','https://example.com/media/drill-1.jpg',
      'evidence',jsonb_build_object('origin','json_ld','sourceUrl','https://example.com/p/drill-1','confidence',0.98)
    )),
    'prices',jsonb_build_array(jsonb_build_object(
      'amountMinor',12900,'currency','EUR','taxInclusive',true,'kind','selling',
      'evidence',jsonb_build_object('origin','json_ld','sourceUrl','https://example.com/p/drill-1','confidence',0.98)
    ))
  ),
  jsonb_build_object(
    'title',jsonb_build_object('origin','json_ld','sourceUrl','https://example.com/p/drill-1','confidence',0.99),
    'gtin',jsonb_build_object('origin','json_ld','sourceUrl','https://example.com/p/drill-1','confidence',0.99),
    'color',jsonb_build_object('origin','json_ld','sourceUrl','https://example.com/p/drill-1','confidence',0.99)
  ),
  jsonb_build_object('valid',true,'issues','[]'::jsonb),now()
);

SELECT count(*) AS canonical_before FROM public.canonical_variants \gset
SELECT count(*) AS offers_before FROM public.vendor_offers \gset

SELECT bls_private.promote_catalog_web_crawl_job(:'job_id') AS first_promotion \gset
SELECT bls_private.promote_catalog_web_crawl_job(:'job_id') AS second_promotion \gset

DO $$
DECLARE
  v_source uuid := :'source_id';
  v_job uuid := :'job_id';
  v_snapshot uuid;
  v_product uuid;
BEGIN
  SELECT snapshot_id INTO v_snapshot FROM public.catalog_web_crawl_jobs WHERE id=v_job;
  IF v_snapshot IS NULL THEN RAISE EXCEPTION 'promotion did not bind crawl job snapshot'; END IF;
  IF (SELECT promoted_product_count FROM public.catalog_web_crawl_jobs WHERE id=v_job)<>1 THEN
    RAISE EXCEPTION 'expected one promoted product';
  END IF;
  IF (SELECT count(*) FROM public.catalog_source_snapshots WHERE source_id=v_source)<>1 THEN
    RAISE EXCEPTION 'promotion is not snapshot-idempotent';
  END IF;
  IF (SELECT row_count FROM public.catalog_source_snapshots WHERE id=v_snapshot)<>1 THEN
    RAISE EXCEPTION 'snapshot row_count mismatch';
  END IF;
  SELECT id INTO v_product FROM public.catalog_source_products
  WHERE snapshot_id=v_snapshot AND source_product_key='DRILL-1';
  IF v_product IS NULL THEN RAISE EXCEPTION 'source product was not created'; END IF;
  IF (SELECT count(*) FROM public.catalog_source_products WHERE snapshot_id=v_snapshot)<>1 THEN
    RAISE EXCEPTION 'promotion is not source-product-idempotent';
  END IF;
  IF (SELECT source_identity->>'gtin' FROM public.catalog_source_products WHERE id=v_product)<>'0195949052637' THEN
    RAISE EXCEPTION 'GTIN was not preserved';
  END IF;
  IF (SELECT source_identity->>'brand' FROM public.catalog_source_products WHERE id=v_product)<>'Example Tools' THEN
    RAISE EXCEPTION 'brand was not preserved';
  END IF;
  IF (SELECT normalized_payload->>'supplierDescription' FROM public.catalog_source_products WHERE id=v_product) NOT LIKE 'Professional 18V%' THEN
    RAISE EXCEPTION 'description was not preserved';
  END IF;
  IF (SELECT source_image_url FROM public.catalog_source_products WHERE id=v_product)<>'https://example.com/media/drill-1.jpg' THEN
    RAISE EXCEPTION 'primary image evidence was not preserved';
  END IF;
  IF NOT (SELECT raw_payload ? 'fieldProvenance' FROM public.catalog_source_products WHERE id=v_product) THEN
    RAISE EXCEPTION 'field provenance was not preserved';
  END IF;
  IF (SELECT count(*) FROM public.catalog_source_taxonomy_nodes WHERE source_id=v_source)<>3 THEN
    RAISE EXCEPTION 'expected three source taxonomy nodes';
  END IF;
  IF (SELECT count(*) FROM public.catalog_source_attribute_observations WHERE source_product_id=v_product)<>3 THEN
    RAISE EXCEPTION 'expected three attribute observations';
  END IF;
  IF (SELECT count(*) FROM public.catalog_price_observations WHERE source_product_id=v_product)<>1 THEN
    RAISE EXCEPTION 'expected one idempotent price observation';
  END IF;
  IF (SELECT amount_minor FROM public.catalog_price_observations WHERE source_product_id=v_product)<>12900 THEN
    RAISE EXCEPTION 'price amount mismatch';
  END IF;
  IF (SELECT price_kind FROM public.catalog_price_observations WHERE source_product_id=v_product)<>'offer' THEN
    RAISE EXCEPTION 'selling price was not mapped to offer evidence';
  END IF;
  IF (SELECT status FROM public.catalog_web_product_extractions WHERE page_id=:'page_id')<>'promoted' THEN
    RAISE EXCEPTION 'crawl extraction was not marked promoted';
  END IF;
  IF (SELECT promoted_source_product_id FROM public.catalog_web_product_extractions WHERE page_id=:'page_id')<>v_product THEN
    RAISE EXCEPTION 'crawl extraction was not linked to source product';
  END IF;
END $$;

SELECT count(*) AS canonical_after FROM public.canonical_variants \gset
SELECT count(*) AS offers_after FROM public.vendor_offers \gset

\if :{?canonical_before}
\else
  \quit 1
\endif

DO $$
BEGIN
  IF :'canonical_before'::integer<>:'canonical_after'::integer THEN
    RAISE EXCEPTION 'PIM promotion created canonical products';
  END IF;
  IF :'offers_before'::integer<>:'offers_after'::integer THEN
    RAISE EXCEPTION 'PIM promotion created vendor offers';
  END IF;
  IF COALESCE((:'first_promotion'::jsonb->>'publicationActivated')::boolean,true) THEN
    RAISE EXCEPTION 'promotion activated publication';
  END IF;
  IF COALESCE((:'first_promotion'::jsonb->>'vendorOffersCreated')::integer,-1)<>0 THEN
    RAISE EXCEPTION 'promotion reported vendor offers';
  END IF;
  IF COALESCE((:'second_promotion'::jsonb->>'snapshotReused')::boolean,false)<>true THEN
    RAISE EXCEPTION 'second promotion did not reuse immutable snapshot';
  END IF;
END $$;

-- A conflicting second payload under the same source product key must fail closed.
INSERT INTO public.catalog_web_crawl_pages(
  job_id,url,normalized_url,depth,status,robots_allowed,resolved_addresses,fetch_mode,http_status,
  content_type,response_bytes,response_sha256,product_likelihood,extraction_status,fetched_at
)
VALUES(
  :'job_id','https://example.com/p/drill-1-conflict','https://example.com/p/drill-1-conflict',0,'fetched',true,
  ARRAY['93.184.216.34'::inet],'http',200,'text/html',1024,repeat('b',64),1,'extracted',now()
)
RETURNING id AS conflict_page_id \gset

INSERT INTO public.catalog_web_product_extractions(
  page_id,extraction_version,ordinal,source_product_key,status,confidence,extracted_payload,field_provenance,quality_payload,accepted_at
)
VALUES(
  :'conflict_page_id','web-crawler-v1',0,'DRILL-1','accepted',0.99000,
  jsonb_build_object('sourceProductKey','DRILL-1','sourceUrl','https://example.com/p/drill-1-conflict','title','Conflicting Drill'),
  jsonb_build_object('title',jsonb_build_object('origin','json_ld','sourceUrl','https://example.com/p/drill-1-conflict','confidence',0.99)),
  jsonb_build_object('valid',true,'issues','[]'::jsonb),now()
);

DO $$
BEGIN
  BEGIN
    PERFORM bls_private.promote_catalog_web_crawl_job(:'job_id');
    RAISE EXCEPTION 'expected source-key collision rejection';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%source product key collision%' THEN RAISE; END IF;
  END;
END $$;

SELECT 'catalog crawl PIM promotion smoke passed' AS result;

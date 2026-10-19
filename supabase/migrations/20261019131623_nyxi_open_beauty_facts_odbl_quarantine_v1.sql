-- Recovered verbatim from Supabase production migration history, 2026-10-19.

CREATE SCHEMA IF NOT EXISTS nyxi_open_data;
REVOKE ALL ON SCHEMA nyxi_open_data FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA nyxi_open_data TO service_role;

CREATE TABLE IF NOT EXISTS nyxi_open_data.obf_nail_api_batches_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
 request_id bigint NOT NULL UNIQUE,
 official_api_endpoint text NOT NULL DEFAULT 'https://world.openbeautyfacts.org/api/v2/search',
 query_category text NOT NULL DEFAULT 'en:nail-polishes',
 requested_page integer NOT NULL CHECK(requested_page BETWEEN 1 AND 10000),
 requested_page_size integer NOT NULL CHECK(requested_page_size BETWEEN 1 AND 50),
 upstream_reported_count integer NOT NULL CHECK(upstream_reported_count>=0),
 upstream_page_count integer NOT NULL CHECK(upstream_page_count>=0),
 raw_response_body text NOT NULL,
 raw_response_sha256 text NOT NULL CHECK(raw_response_sha256 ~ '^[0-9a-f]{64}$'),
 ingested_product_rows integer NOT NULL DEFAULT 0 CHECK(ingested_product_rows >= 0),
 license_database text NOT NULL DEFAULT 'ODbL-1.0' CHECK(license_database='ODbL-1.0'),
 license_contents text NOT NULL DEFAULT 'DbCL-1.0' CHECK(license_contents='DbCL-1.0'),
 attribution_text text NOT NULL DEFAULT 'Open Beauty Facts contributors · ODbL 1.0 / DbCL 1.0',
 license_info_url text NOT NULL DEFAULT 'https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/',
 public_use_enabled boolean NOT NULL DEFAULT false CHECK(public_use_enabled=false),
 no_images boolean NOT NULL DEFAULT true CHECK(no_images=true),
 copyright_export_ready boolean NOT NULL DEFAULT false,
 fetched_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obf_batch_source_time_idx ON nyxi_open_data.obf_nail_api_batches_v1(source_id,fetched_at DESC);

CREATE TABLE IF NOT EXISTS nyxi_open_data.obf_nail_products_v1 (
 barcode text PRIMARY KEY CHECK (barcode ~ '^[0-9]{8,14}$'),
 source_id uuid NOT NULL REFERENCES public.nyxi_sources(id) ON DELETE RESTRICT,
 raw_batch_id uuid NOT NULL REFERENCES nyxi_open_data.obf_nail_api_batches_v1(id) ON DELETE RESTRICT,
 product_name text NOT NULL CHECK(length(trim(product_name)) BETWEEN 2 AND 650),
 brands_as_entered text,
 categories_tags text[] NOT NULL,
 ingredient_label_as_entered text,
 source_last_modified_t bigint,
 source_product_url text GENERATED ALWAYS AS ('https://world.openbeautyfacts.org/product/'||barcode) STORED,
 community_verified_by_manufacturer boolean NOT NULL DEFAULT false CHECK(community_verified_by_manufacturer=false),
 product_variant_sku_confirmed boolean NOT NULL DEFAULT false CHECK(product_variant_sku_confirmed=false),
 shade_hex_confirmed boolean NOT NULL DEFAULT false CHECK(shade_hex_confirmed=false),
 publication_approved boolean NOT NULL DEFAULT false CHECK(publication_approved=false),
 raw_product jsonb NOT NULL,
 license_database text NOT NULL DEFAULT 'ODbL-1.0' CHECK(license_database='ODbL-1.0'),
 license_contents text NOT NULL DEFAULT 'DbCL-1.0' CHECK(license_contents='DbCL-1.0'),
 first_imported_at timestamptz NOT NULL DEFAULT now(),
 last_imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obf_product_brand_idx ON nyxi_open_data.obf_nail_products_v1 (lower(brands_as_entered));
CREATE INDEX IF NOT EXISTS obf_product_ingredients_idx ON nyxi_open_data.obf_nail_products_v1 USING gin (to_tsvector('simple',coalesce(ingredient_label_as_entered,'')));

ALTER TABLE nyxi_open_data.obf_nail_api_batches_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nyxi_open_data.obf_nail_products_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON nyxi_open_data.obf_nail_api_batches_v1 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON nyxi_open_data.obf_nail_products_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON nyxi_open_data.obf_nail_api_batches_v1 TO service_role;
GRANT SELECT,INSERT,UPDATE ON nyxi_open_data.obf_nail_products_v1 TO service_role;

CREATE OR REPLACE FUNCTION nyxi_open_data.import_obf_nail_page_v1(
 p_request_id bigint, p_expected_page integer, p_page_size integer
) RETURNS TABLE (batch_id uuid, rows_imported integer, upstream_count integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,nyxi_open_data,extensions AS $$
DECLARE v_response record; v_data jsonb; v_batch uuid; v_source uuid; v_inserted int; v_n int;
BEGIN
 IF p_request_id IS NULL OR p_expected_page NOT BETWEEN 1 AND 10000 OR p_page_size NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'Invalid bounded OBF API page import';
 END IF;
 SELECT r.status_code,r.error_msg,r.content INTO v_response FROM net._http_response r WHERE r.id=p_request_id;
 IF NOT FOUND OR v_response.status_code<>200 OR v_response.error_msg IS NOT NULL THEN
  RAISE EXCEPTION 'OBF fetch did not complete HTTP 200';
 END IF;
 IF length(v_response.content)>1000000 THEN RAISE EXCEPTION 'OBF batch exceeds bounded size'; END IF;
 v_data:=v_response.content::jsonb;
 IF jsonb_typeof(v_data->'products')<>'array' OR (v_data->>'page')::int<>p_expected_page
  OR (v_data->>'page_size')::int<>p_page_size OR jsonb_array_length(v_data->'products')>p_page_size
  OR (v_data->>'count')::int<0 THEN
  RAISE EXCEPTION 'Unexpected OBF query or page envelope';
 END IF;
 SELECT id INTO v_source FROM public.nyxi_sources
 WHERE source_key='community_open_beauty_facts_products' AND canonical_url='https://world.openbeautyfacts.org';
 IF v_source IS NULL THEN RAISE EXCEPTION 'Open data source not registered'; END IF;
 INSERT INTO nyxi_open_data.obf_nail_api_batches_v1(
 source_id,request_id,requested_page,requested_page_size,
 upstream_reported_count,upstream_page_count,raw_response_body,raw_response_sha256)
 VALUES(v_source,p_request_id,p_expected_page,p_page_size,
 (v_data->>'count')::int,(v_data->>'page_count')::int,v_response.content,
 encode(extensions.digest(convert_to(v_response.content,'UTF8'),'sha256'),'hex'))
 ON CONFLICT(request_id) DO NOTHING RETURNING id INTO v_batch;
 IF v_batch IS NULL THEN
  SELECT b.id,b.ingested_product_rows,b.upstream_reported_count INTO batch_id,rows_imported,upstream_count
  FROM nyxi_open_data.obf_nail_api_batches_v1 b WHERE b.request_id=p_request_id;
  RETURN NEXT; RETURN;
 END IF;
 WITH candidates AS (
 SELECT item AS v
 FROM jsonb_array_elements(v_data->'products') AS item
 WHERE item->>'code' ~ '^[0-9]{8,14}$'
   AND length(trim(coalesce(item->>'product_name',''))) BETWEEN 2 AND 650
   AND coalesce(item->'categories_tags','[]'::jsonb) ? 'en:nail-polishes'
 ),
 saved AS (
 INSERT INTO nyxi_open_data.obf_nail_products_v1(
 barcode,source_id,raw_batch_id,product_name,brands_as_entered,categories_tags,
 ingredient_label_as_entered,source_last_modified_t,raw_product)
 SELECT c.v->>'code',v_source,v_batch,c.v->>'product_name',
 NULLIF(c.v->>'brands',''),
 ARRAY(SELECT jsonb_array_elements_text(c.v->'categories_tags')),
 NULLIF(c.v->>'ingredients_text',''),
 CASE WHEN c.v->>'last_modified_t'~'^[0-9]{9,11}$' THEN (c.v->>'last_modified_t')::bigint ELSE NULL END,
 c.v
 FROM candidates c
 ON CONFLICT(barcode) DO UPDATE SET
 raw_batch_id=EXCLUDED.raw_batch_id,product_name=EXCLUDED.product_name,
 brands_as_entered=EXCLUDED.brands_as_entered,categories_tags=EXCLUDED.categories_tags,
 ingredient_label_as_entered=EXCLUDED.ingredient_label_as_entered,
 source_last_modified_t=EXCLUDED.source_last_modified_t,
 raw_product=EXCLUDED.raw_product,last_imported_at=now()
 RETURNING barcode
 )
 SELECT count(*)::int INTO v_inserted FROM saved;
 UPDATE nyxi_open_data.obf_nail_api_batches_v1 b SET ingested_product_rows=v_inserted WHERE b.id=v_batch;
 batch_id:=v_batch;rows_imported:=v_inserted;upstream_count:=(v_data->>'count')::int;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION nyxi_open_data.import_obf_nail_page_v1(bigint,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nyxi_open_data.import_obf_nail_page_v1(bigint,integer,integer) TO service_role;
CREATE OR REPLACE VIEW nyxi_open_data.obf_nail_research_summary_v1 WITH (security_invoker=true) AS
SELECT count(*)::int imported_products,
 count(*) FILTER(WHERE ingredient_label_as_entered IS NOT NULL)::int products_with_ingredient_labels,
 count(DISTINCT brands_as_entered)::int community_brand_strings,
 count(*) FILTER(WHERE publication_approved)::int public_approved,
 false AS safe_to_treat_as_manufacturer_verified,
 'OBF community nail polish data ODbL 1.0 / DbCL 1.0 — private review only'::text AS rights_notice
FROM nyxi_open_data.obf_nail_products_v1;
REVOKE ALL ON nyxi_open_data.obf_nail_research_summary_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON nyxi_open_data.obf_nail_research_summary_v1 TO service_role;


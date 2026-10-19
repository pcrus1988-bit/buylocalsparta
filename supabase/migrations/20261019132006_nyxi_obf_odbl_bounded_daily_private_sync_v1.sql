-- Recovered verbatim from Supabase production migration history, 2026-10-19.

CREATE TABLE IF NOT EXISTS nyxi_open_data.obf_daily_sync_requests_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sync_day date NOT NULL,
 page integer NOT NULL CHECK(page BETWEEN 1 AND 4),
 page_size integer NOT NULL DEFAULT 50 CHECK(page_size=50),
 request_id bigint NOT NULL UNIQUE,
 request_status text NOT NULL DEFAULT 'requested'
 CHECK(request_status IN('requested','processed','failed')),
 reported_total integer,
 accepted_rows integer,
 error_code text,
 requested_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 UNIQUE(sync_day,page)
);
ALTER TABLE nyxi_open_data.obf_daily_sync_requests_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON nyxi_open_data.obf_daily_sync_requests_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON nyxi_open_data.obf_daily_sync_requests_v1 TO service_role;

CREATE OR REPLACE FUNCTION nyxi_open_data.request_obf_daily_sync_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,nyxi_open_data
AS $$
DECLARE n int:=0; page_no int; id bigint; today_utc date:=(now() at time zone 'UTC')::date;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.nyxi_sources WHERE source_key='community_open_beauty_facts_products'
  AND metadata->>'rights_review_status'='odbl_private_research_approved_no_public_use') THEN
  RAISE EXCEPTION 'Licence gate: private ODbL source review must be present';
 END IF;
 FOR page_no IN 1..4 LOOP
  IF EXISTS (SELECT 1 FROM nyxi_open_data.obf_daily_sync_requests_v1
             WHERE sync_day=today_utc AND page=page_no) THEN CONTINUE; END IF;
  id:=net.http_get(url:='https://world.openbeautyfacts.org/api/v2/search',
      params:=jsonb_build_object('categories_tags_en','nail-polishes','page_size','50',
                                 'page',page_no::text,'fields','code,product_name,brands,categories_tags,ingredients_text,last_modified_t'),
      headers:=jsonb_build_object('Accept','application/json',
                   'User-Agent','NYXI-Research/0.1 (research@kontamou.site)'),
      timeout_milliseconds:=15000);
  INSERT INTO nyxi_open_data.obf_daily_sync_requests_v1(sync_day,page,request_id)
  VALUES(today_utc,page_no,id) ON CONFLICT(sync_day,page) DO NOTHING;
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('requested',n,'per_day_max',4,'category','nail-polishes',
   'query_rate_limit_respected',true,'public_release_allowed',false);
END $$;
REVOKE ALL ON FUNCTION nyxi_open_data.request_obf_daily_sync_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nyxi_open_data.request_obf_daily_sync_v1() TO service_role;

CREATE OR REPLACE FUNCTION nyxi_open_data.process_obf_daily_sync_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,nyxi_open_data
AS $$
DECLARE item record; response_code integer; err text; res record; processed int:=0;
 failed int:=0; pending int:=0;
BEGIN
 FOR item IN SELECT * FROM nyxi_open_data.obf_daily_sync_requests_v1
 WHERE request_status='requested' ORDER BY requested_at, page LIMIT 8 FOR UPDATE SKIP LOCKED LOOP
  SELECT status_code,error_msg INTO response_code,err FROM net._http_response WHERE id=item.request_id;
  IF NOT FOUND THEN
   IF item.requested_at < now()-interval '6 minutes' THEN
    UPDATE nyxi_open_data.obf_daily_sync_requests_v1
    SET request_status='failed',error_code='no_http_response_after_6m',processed_at=now()
    WHERE id=item.id; failed:=failed+1;
   ELSE pending:=pending+1; END IF;
   CONTINUE;
  END IF;
  IF response_code<>200 OR err IS NOT NULL THEN
   UPDATE nyxi_open_data.obf_daily_sync_requests_v1
   SET request_status='failed',error_code='upstream_http_'||coalesce(response_code::text,'unknown'),processed_at=now()
   WHERE id=item.id;
   failed:=failed+1; CONTINUE;
  END IF;
  BEGIN
   SELECT * INTO res FROM nyxi_open_data.import_obf_nail_page_v1(item.request_id,item.page,50);
   UPDATE nyxi_open_data.obf_daily_sync_requests_v1
   SET request_status='processed',reported_total=res.upstream_count,
       accepted_rows=res.rows_imported,processed_at=now()
   WHERE id=item.id;
   processed:=processed+1;
  EXCEPTION WHEN OTHERS THEN
   UPDATE nyxi_open_data.obf_daily_sync_requests_v1
   SET request_status='failed',error_code='bounded_validation_or_upstream_shape_failure',processed_at=now()
   WHERE id=item.id;
   failed:=failed+1;
  END;
 END LOOP;
 RETURN jsonb_build_object('processed_pages',processed,'failed_pages',failed,
   'pending_pages',pending,'public_release_allowed',false);
END $$;
REVOKE ALL ON FUNCTION nyxi_open_data.process_obf_daily_sync_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION nyxi_open_data.process_obf_daily_sync_v1() TO service_role;

CREATE OR REPLACE VIEW nyxi_open_data.obf_sync_health_v1 WITH (security_invoker=true) AS
SELECT sync_day,count(*)::integer requested_pages,
 count(*) FILTER(WHERE request_status='processed')::integer processed_pages,
 count(*) FILTER(WHERE request_status='failed')::integer failed_pages,
 sum(coalesce(accepted_rows,0))::integer accepted_rows,
 max(reported_total)::integer reported_category_total,
 greatest(0,max(coalesce(reported_total,0))-200)::integer possible_rows_beyond_four_page_limit,
 max(processed_at) last_processing_at
FROM nyxi_open_data.obf_daily_sync_requests_v1 GROUP BY sync_day ORDER BY sync_day DESC;
REVOKE ALL ON nyxi_open_data.obf_sync_health_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON nyxi_open_data.obf_sync_health_v1 TO service_role;


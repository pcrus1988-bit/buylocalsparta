-- KONTA MOU — vendor-owned XML product feeds.
-- XML remains source evidence. New catalogue identities still enter the existing
-- vendor submission/matching workflow and never bypass canonical governance.

BEGIN;

CREATE TABLE public.vendor_product_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vfeed_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  location_id uuid NOT NULL REFERENCES public.vendor_locations(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  source_type text NOT NULL CHECK (source_type IN ('url','upload')),
  source_url text,
  source_filename text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','error')),
  sync_interval_minutes integer NOT NULL DEFAULT 360 CHECK (sync_interval_minutes IN (60,180,360,1440)),
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(field_mapping)='object'),
  category_mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(category_mapping)='object'),
  default_category_id uuid REFERENCES public.categories(id),
  last_source_hash text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  product_count integer NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  ready_count integer NOT NULL DEFAULT 0 CHECK (ready_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source_type='url' AND source_url IS NOT NULL AND length(btrim(source_url)) BETWEEN 8 AND 2048)
    OR (source_type='upload' AND source_url IS NULL AND source_filename IS NOT NULL)
  )
);

CREATE UNIQUE INDEX vendor_product_feeds_vendor_url_unique
  ON public.vendor_product_feeds(vendor_id,lower(source_url))
  WHERE source_type='url' AND source_url IS NOT NULL;
CREATE INDEX vendor_product_feeds_vendor_updated_idx
  ON public.vendor_product_feeds(vendor_id,updated_at DESC);
CREATE INDEX vendor_product_feeds_due_idx
  ON public.vendor_product_feeds(next_sync_at,id)
  WHERE source_type='url' AND status='active' AND next_sync_at IS NOT NULL;

CREATE TABLE public.vendor_product_feed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vfeedrun_' || replace(gen_random_uuid()::text,'-','')),
  feed_id uuid NOT NULL REFERENCES public.vendor_product_feeds(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  trigger_type text NOT NULL CHECK (trigger_type IN ('upload','manual','scheduled')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','partial','failed','unchanged')),
  source_hash text,
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  error_rows integer NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors)='array'),
  created_submissions integer NOT NULL DEFAULT 0 CHECK (created_submissions >= 0),
  updated_submissions integer NOT NULL DEFAULT 0 CHECK (updated_submissions >= 0),
  updated_offers integer NOT NULL DEFAULT 0 CHECK (updated_offers >= 0),
  protected_inventory_rows integer NOT NULL DEFAULT 0 CHECK (protected_inventory_rows >= 0),
  missing_rows integer NOT NULL DEFAULT 0 CHECK (missing_rows >= 0),
  error_message text,
  created_by uuid REFERENCES public.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_product_feed_runs_feed_started_idx
  ON public.vendor_product_feed_runs(feed_id,started_at DESC);
CREATE INDEX vendor_product_feed_runs_vendor_started_idx
  ON public.vendor_product_feed_runs(vendor_id,started_at DESC);

CREATE TABLE public.vendor_product_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.vendor_product_feeds(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  external_product_id text NOT NULL CHECK (length(btrim(external_product_id)) BETWEEN 1 AND 300),
  vendor_sku text,
  gtin text,
  source_hash text NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_payload)='object'),
  submission_id uuid REFERENCES public.vendor_product_submissions(id),
  canonical_variant_id uuid REFERENCES public.canonical_variants(id),
  offer_id uuid REFERENCES public.vendor_offers(id),
  state text NOT NULL DEFAULT 'present' CHECK (state IN ('present','missing','retired','invalid')),
  consecutive_missing integer NOT NULL DEFAULT 0 CHECK (consecutive_missing >= 0),
  hidden_by_feed boolean NOT NULL DEFAULT false,
  hidden_by_feed_at timestamptz,
  previous_offer_merchant_visible boolean,
  last_validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(last_validation_errors)='array'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_stock_sync_at timestamptz,
  last_changed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feed_id,external_product_id)
);

CREATE INDEX vendor_product_feed_items_vendor_state_idx
  ON public.vendor_product_feed_items(vendor_id,state,updated_at DESC);
CREATE INDEX vendor_product_feed_items_submission_idx
  ON public.vendor_product_feed_items(submission_id)
  WHERE submission_id IS NOT NULL;
CREATE INDEX vendor_product_feed_items_offer_idx
  ON public.vendor_product_feed_items(offer_id)
  WHERE offer_id IS NOT NULL;
CREATE INDEX vendor_product_feed_items_vendor_sku_idx
  ON public.vendor_product_feed_items(vendor_id,vendor_sku)
  WHERE vendor_sku IS NOT NULL;
CREATE INDEX vendor_product_feed_items_gtin_idx
  ON public.vendor_product_feed_items(vendor_id,gtin)
  WHERE gtin IS NOT NULL;

CREATE OR REPLACE FUNCTION bls_private.validate_vendor_product_feed_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_market uuid;
  v_location_vendor uuid;
  v_location_market uuid;
  v_category_market uuid;
BEGIN
  SELECT market_id INTO v_market FROM public.vendor_businesses WHERE id=NEW.vendor_id;
  SELECT vendor_id,market_id INTO v_location_vendor,v_location_market
    FROM public.vendor_locations WHERE id=NEW.location_id;
  IF v_market IS NULL OR v_market<>NEW.market_id
     OR v_location_vendor IS DISTINCT FROM NEW.vendor_id
     OR v_location_market IS DISTINCT FROM NEW.market_id THEN
    RAISE EXCEPTION 'vendor product feed scope mismatch';
  END IF;
  IF NEW.default_category_id IS NOT NULL THEN
    SELECT market_id INTO v_category_market FROM public.categories WHERE id=NEW.default_category_id;
    IF v_category_market IS NOT NULL AND v_category_market<>NEW.market_id THEN
      RAISE EXCEPTION 'vendor product feed category scope mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_product_feed_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_product_feeds
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_product_feed_scope();

CREATE OR REPLACE FUNCTION bls_private.validate_vendor_product_feed_child_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_vendor uuid;
  v_market uuid;
BEGIN
  SELECT vendor_id,market_id INTO v_vendor,v_market
    FROM public.vendor_product_feeds WHERE id=NEW.feed_id;
  IF v_vendor IS NULL OR v_vendor<>NEW.vendor_id THEN
    RAISE EXCEPTION 'vendor product feed child scope mismatch';
  END IF;
  IF TG_TABLE_NAME='vendor_product_feed_runs' THEN
    IF v_market<>NEW.market_id THEN
      RAISE EXCEPTION 'vendor product feed run market scope mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_product_feed_run_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_product_feed_runs
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_product_feed_child_scope();
CREATE TRIGGER vendor_product_feed_item_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_product_feed_items
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_product_feed_child_scope();

ALTER TABLE public.vendor_product_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_feed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_product_feeds_vendor_select
  ON public.vendor_product_feeds FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_product_feeds_vendor_insert
  ON public.vendor_product_feeds FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  );
CREATE POLICY vendor_product_feeds_vendor_update
  ON public.vendor_product_feeds FOR UPDATE TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid)
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  );
CREATE POLICY vendor_product_feeds_platform_all
  ON public.vendor_product_feeds FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_product_feed_runs_vendor_select
  ON public.vendor_product_feed_runs FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_runs_vendor_insert
  ON public.vendor_product_feed_runs FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  );
CREATE POLICY vendor_product_feed_runs_vendor_update
  ON public.vendor_product_feed_runs FOR UPDATE TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid)
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
  );
CREATE POLICY vendor_product_feed_runs_platform_all
  ON public.vendor_product_feed_runs FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_product_feed_items_vendor_select
  ON public.vendor_product_feed_items FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_items_vendor_insert
  ON public.vendor_product_feed_items FOR INSERT TO bls_app_runtime
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_items_vendor_update
  ON public.vendor_product_feed_items FOR UPDATE TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_items_platform_all
  ON public.vendor_product_feed_items FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

GRANT SELECT,INSERT,UPDATE ON
  public.vendor_product_feeds,
  public.vendor_product_feed_runs,
  public.vendor_product_feed_items
TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON
  public.vendor_product_feeds,
  public.vendor_product_feed_runs,
  public.vendor_product_feed_items
TO bls_platform_runtime;

REVOKE ALL ON public.vendor_product_feeds,public.vendor_product_feed_runs,public.vendor_product_feed_items FROM anon,authenticated;

COMMENT ON TABLE public.vendor_product_feeds IS
  'Vendor-owned XML product-feed connection. Source XML is evidence; canonical identity and publication remain governed.';
COMMENT ON TABLE public.vendor_product_feed_runs IS
  'Auditable execution history for upload, manual and scheduled vendor XML feed synchronization.';
COMMENT ON TABLE public.vendor_product_feed_items IS
  'Stable external feed identity and reconciliation state. It prevents duplicate submissions across repeated XML syncs.';

COMMIT;

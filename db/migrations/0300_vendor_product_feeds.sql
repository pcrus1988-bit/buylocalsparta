-- KONTA MOU — vendor-owned XML product feeds and synchronization history.
-- Feed ingestion is evidence-first: identity, pricing and stock remain vendor-scoped,
-- while canonical identity and publication keep their existing governance boundaries.

BEGIN;

ALTER TABLE public.vendor_product_submissions
  DROP CONSTRAINT IF EXISTS vendor_product_submissions_source_check;
ALTER TABLE public.vendor_product_submissions
  ADD CONSTRAINT vendor_product_submissions_source_check
  CHECK (source IN ('manual','csv','api','xml_feed'));

CREATE TABLE public.vendor_product_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vfeed_' || replace(gen_random_uuid()::text,'-','')),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id),
  location_id uuid NOT NULL REFERENCES public.vendor_locations(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  source_kind text NOT NULL CHECK (source_kind IN ('upload','url')),
  source_url text,
  source_filename text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  detected_format text NOT NULL DEFAULT 'custom'
    CHECK (detected_format IN ('google_merchant','woocommerce','shopify','prestashop','magento','skroutz','bestprice','kontamou','custom')),
  record_tag text NOT NULL DEFAULT 'product' CHECK (length(record_tag) BETWEEN 1 AND 80),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  sync_interval_minutes integer NOT NULL DEFAULT 360 CHECK (sync_interval_minutes IN (60,180,360,1440)),
  missing_grace_runs integer NOT NULL DEFAULT 2 CHECK (missing_grace_runs BETWEEN 1 AND 10),
  last_source_hash char(64),
  last_product_count integer NOT NULL DEFAULT 0 CHECK (last_product_count >= 0),
  last_ready_count integer NOT NULL DEFAULT 0 CHECK (last_ready_count >= 0),
  last_warning_count integer NOT NULL DEFAULT 0 CHECK (last_warning_count >= 0),
  last_error_count integer NOT NULL DEFAULT 0 CHECK (last_error_count >= 0),
  last_excluded_count integer NOT NULL DEFAULT 0 CHECK (last_excluded_count >= 0),
  last_sync_started_at timestamptz,
  last_sync_completed_at timestamptz,
  next_sync_at timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 1500),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_kind='url' AND source_url IS NOT NULL) OR (source_kind='upload' AND source_url IS NULL))
);

CREATE UNIQUE INDEX vendor_product_feeds_vendor_url_unique
  ON public.vendor_product_feeds(vendor_id,source_url)
  WHERE source_kind='url' AND source_url IS NOT NULL;
CREATE INDEX vendor_product_feeds_due_idx
  ON public.vendor_product_feeds(status,next_sync_at)
  WHERE source_kind='url' AND status='active';

CREATE TABLE public.vendor_product_feed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vfrun_' || replace(gen_random_uuid()::text,'-','')),
  feed_id uuid NOT NULL REFERENCES public.vendor_product_feeds(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id),
  trigger_type text NOT NULL CHECK (trigger_type IN ('upload','manual','scheduled')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  source_hash char(64),
  product_count integer NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  ready_count integer NOT NULL DEFAULT 0 CHECK (ready_count >= 0),
  warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  excluded_count integer NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
  new_count integer NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  missing_count integer NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  linked_offer_count integer NOT NULL DEFAULT 0 CHECK (linked_offer_count >= 0),
  submission_count integer NOT NULL DEFAULT 0 CHECK (submission_count >= 0),
  error_message text CHECK (error_message IS NULL OR length(error_message) <= 1500),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX vendor_product_feed_runs_feed_idx
  ON public.vendor_product_feed_runs(feed_id,started_at DESC);

CREATE TABLE public.vendor_product_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.vendor_product_feeds(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id),
  external_product_id text NOT NULL CHECK (length(btrim(external_product_id)) BETWEEN 1 AND 300),
  vendor_sku text,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  availability text,
  brand text,
  category_path text,
  image_url text,
  additional_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  gtin text,
  mpn text,
  product_url text,
  size text,
  color text,
  source_hash char(64) NOT NULL,
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','warning','error','excluded','missing')),
  validation_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_variant_id uuid REFERENCES public.canonical_variants(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.vendor_product_submissions(id) ON DELETE SET NULL,
  vendor_offer_id uuid REFERENCES public.vendor_offers(id) ON DELETE SET NULL,
  missing_successful_runs integer NOT NULL DEFAULT 0 CHECK (missing_successful_runs >= 0),
  hidden_by_feed boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_changed_at timestamptz NOT NULL DEFAULT now(),
  last_stock_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feed_id,external_product_id)
);
CREATE INDEX vendor_product_feed_items_vendor_sku_idx
  ON public.vendor_product_feed_items(vendor_id,vendor_sku)
  WHERE vendor_sku IS NOT NULL;
CREATE INDEX vendor_product_feed_items_gtin_idx
  ON public.vendor_product_feed_items(gtin)
  WHERE gtin IS NOT NULL;
CREATE INDEX vendor_product_feed_items_state_idx
  ON public.vendor_product_feed_items(feed_id,state,updated_at DESC);

CREATE OR REPLACE FUNCTION bls_private.validate_vendor_product_feed_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_market uuid;
  v_location_vendor uuid;
  v_location_market uuid;
BEGIN
  SELECT market_id INTO v_market FROM public.vendor_businesses WHERE id=NEW.vendor_id;
  SELECT vendor_id,market_id INTO v_location_vendor,v_location_market FROM public.vendor_locations WHERE id=NEW.location_id;
  IF v_market IS NULL OR v_market<>NEW.market_id THEN RAISE EXCEPTION 'vendor product feed market scope mismatch'; END IF;
  IF v_location_vendor IS DISTINCT FROM NEW.vendor_id OR v_location_market IS DISTINCT FROM NEW.market_id THEN
    RAISE EXCEPTION 'vendor product feed location scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vendor_product_feeds_scope_guard
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
  SELECT vendor_id,market_id INTO v_vendor,v_market FROM public.vendor_product_feeds WHERE id=NEW.feed_id;
  IF v_vendor IS DISTINCT FROM NEW.vendor_id OR v_market IS DISTINCT FROM NEW.market_id THEN
    RAISE EXCEPTION 'vendor product feed child scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vendor_product_feed_runs_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_product_feed_runs
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_product_feed_child_scope();
CREATE TRIGGER vendor_product_feed_items_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_product_feed_items
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_product_feed_child_scope();

ALTER TABLE public.vendor_product_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_feed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_product_feeds_vendor_select ON public.vendor_product_feeds FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feeds_vendor_insert ON public.vendor_product_feeds FOR INSERT TO bls_app_runtime
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feeds_vendor_update ON public.vendor_product_feeds FOR UPDATE TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_runs_vendor_select ON public.vendor_product_feed_runs FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_runs_vendor_insert ON public.vendor_product_feed_runs FOR INSERT TO bls_app_runtime
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_runs_vendor_update ON public.vendor_product_feed_runs FOR UPDATE TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_items_vendor_select ON public.vendor_product_feed_items FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_items_vendor_insert ON public.vendor_product_feed_items FOR INSERT TO bls_app_runtime
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);
CREATE POLICY vendor_product_feed_items_vendor_update ON public.vendor_product_feed_items FOR UPDATE TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid AND market_id=nullif(current_setting('app.market_id',true),'')::uuid);

CREATE POLICY vendor_product_feeds_platform_all ON public.vendor_product_feeds FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY vendor_product_feed_runs_platform_all ON public.vendor_product_feed_runs FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));
CREATE POLICY vendor_product_feed_items_platform_all ON public.vendor_product_feed_items FOR ALL
  USING ((SELECT bls_private.is_platform_runtime())) WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL ON public.vendor_product_feeds,public.vendor_product_feed_runs,public.vendor_product_feed_items FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.vendor_product_feeds,public.vendor_product_feed_runs,public.vendor_product_feed_items TO bls_app_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vendor_product_feeds,public.vendor_product_feed_runs,public.vendor_product_feed_items TO bls_platform_runtime;

COMMENT ON TABLE public.vendor_product_feeds IS
  'Vendor-owned uploaded or URL XML feed configuration. Raw feed credentials are not stored; URL fetches reject embedded credentials and private-network targets.';
COMMENT ON TABLE public.vendor_product_feed_runs IS
  'Auditable synchronization history for vendor product feeds, including validation and reconciliation counters.';
COMMENT ON TABLE public.vendor_product_feed_items IS
  'Vendor-scoped normalized feed identity and commerce evidence linked to governed submissions/canonical variants/offers when safely resolvable.';
COMMENT ON COLUMN public.vendor_product_feed_items.hidden_by_feed IS
  'True only when automatic missing-item reconciliation paused the linked offer; allows safe restoration without overriding unrelated moderation state.';

COMMIT;

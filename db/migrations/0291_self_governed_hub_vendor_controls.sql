-- KONTA MOU - SELF_GOVERNED HUB vendor controls and request workflows.
-- Direct vendor writes remain limited to vendor-owned source/configuration data.
-- Platform-governed promotions, AADE transmission and subscription activation stay approval-gated.

BEGIN;

CREATE TABLE public.vendor_promotion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vprom_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  vendor_offer_id uuid NOT NULL REFERENCES public.vendor_offers(id),
  canonical_variant_id uuid NOT NULL REFERENCES public.canonical_variants(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  currency char(3) NOT NULL DEFAULT 'EUR',
  current_price_snapshot_minor bigint NOT NULL CHECK (current_price_snapshot_minor >= 0),
  promotional_price_minor bigint NOT NULL CHECK (promotional_price_minor >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','applied')),
  requested_by uuid REFERENCES public.users(id),
  reviewed_by uuid REFERENCES public.users(id),
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (promotional_price_minor < current_price_snapshot_minor)
);

CREATE INDEX vendor_promotion_requests_vendor_status_idx
  ON public.vendor_promotion_requests(vendor_id,status,created_at DESC);
CREATE UNIQUE INDEX vendor_promotion_requests_one_pending_offer_idx
  ON public.vendor_promotion_requests(vendor_offer_id)
  WHERE status='pending';

CREATE TABLE public.vendor_aade_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vaade_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  tax_document_id uuid NOT NULL REFERENCES public.tax_documents(id),
  action text NOT NULL CHECK (action IN ('review','retry','reconcile')),
  note text CHECK (note IS NULL OR length(btrim(note)) <= 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','rejected','cancelled')),
  requested_by uuid REFERENCES public.users(id),
  reviewed_by uuid REFERENCES public.users(id),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_aade_action_requests_vendor_status_idx
  ON public.vendor_aade_action_requests(vendor_id,status,created_at DESC);
CREATE UNIQUE INDEX vendor_aade_action_requests_one_pending_action_idx
  ON public.vendor_aade_action_requests(tax_document_id,action)
  WHERE status='pending';

CREATE TABLE public.vendor_subscription_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('vsubchg_' || replace(gen_random_uuid()::text,'-','')),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  vendor_id uuid NOT NULL REFERENCES public.vendor_businesses(id),
  current_subscription_id uuid REFERENCES public.vendor_subscriptions(id),
  requested_plan_id uuid NOT NULL REFERENCES public.vendor_plans(id),
  note text CHECK (note IS NULL OR length(btrim(note)) <= 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','applied')),
  requested_by uuid REFERENCES public.users(id),
  reviewed_by uuid REFERENCES public.users(id),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vendor_subscription_change_requests_vendor_status_idx
  ON public.vendor_subscription_change_requests(vendor_id,status,created_at DESC);
CREATE UNIQUE INDEX vendor_subscription_change_requests_one_pending_vendor_idx
  ON public.vendor_subscription_change_requests(vendor_id)
  WHERE status='pending';

CREATE OR REPLACE FUNCTION bls_private.validate_vendor_promotion_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_vendor uuid;
  v_market uuid;
  v_canonical uuid;
BEGIN
  SELECT vo.vendor_id, vb.market_id, vo.canonical_variant_id
    INTO v_vendor, v_market, v_canonical
    FROM public.vendor_offers vo
    JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
   WHERE vo.id=NEW.vendor_offer_id;
  IF v_vendor IS NULL
     OR v_vendor<>NEW.vendor_id
     OR v_market<>NEW.market_id
     OR v_canonical<>NEW.canonical_variant_id THEN
    RAISE EXCEPTION 'promotion request offer scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_promotion_request_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_promotion_requests
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_promotion_request_scope();

CREATE OR REPLACE FUNCTION bls_private.validate_vendor_aade_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_vendor uuid;
  v_market uuid;
BEGIN
  SELECT td.vendor_id, td.market_id
    INTO v_vendor, v_market
    FROM public.tax_documents td
   WHERE td.id=NEW.tax_document_id;
  IF v_vendor IS NULL OR v_vendor<>NEW.vendor_id OR v_market<>NEW.market_id THEN
    RAISE EXCEPTION 'AADE request document scope mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_aade_request_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_aade_action_requests
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_aade_request_scope();

CREATE OR REPLACE FUNCTION bls_private.validate_vendor_subscription_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, bls_private
AS $$
DECLARE
  v_vendor_market uuid;
  v_plan_market uuid;
  v_plan_status text;
  v_subscription_vendor uuid;
BEGIN
  SELECT market_id INTO v_vendor_market
    FROM public.vendor_businesses
   WHERE id=NEW.vendor_id;
  SELECT market_id,status INTO v_plan_market,v_plan_status
    FROM public.vendor_plans
   WHERE id=NEW.requested_plan_id;
  IF v_vendor_market IS NULL
     OR v_vendor_market<>NEW.market_id
     OR v_plan_market<>NEW.market_id
     OR v_plan_status<>'active' THEN
    RAISE EXCEPTION 'subscription request plan scope mismatch';
  END IF;
  IF NEW.current_subscription_id IS NOT NULL THEN
    SELECT vendor_id INTO v_subscription_vendor
      FROM public.vendor_subscriptions
     WHERE id=NEW.current_subscription_id;
    IF v_subscription_vendor IS DISTINCT FROM NEW.vendor_id THEN
      RAISE EXCEPTION 'subscription request current subscription scope mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_subscription_request_scope_guard
BEFORE INSERT OR UPDATE ON public.vendor_subscription_change_requests
FOR EACH ROW EXECUTE FUNCTION bls_private.validate_vendor_subscription_request_scope();

ALTER TABLE public.vendor_promotion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_aade_action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_subscription_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_promotion_requests_vendor_select
  ON public.vendor_promotion_requests FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_promotion_requests_vendor_insert
  ON public.vendor_promotion_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
    AND status='pending'
  );
CREATE POLICY vendor_promotion_requests_platform_all
  ON public.vendor_promotion_requests FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_aade_action_requests_vendor_select
  ON public.vendor_aade_action_requests FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_aade_action_requests_vendor_insert
  ON public.vendor_aade_action_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
    AND status='pending'
  );
CREATE POLICY vendor_aade_action_requests_platform_all
  ON public.vendor_aade_action_requests FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

CREATE POLICY vendor_subscription_change_requests_vendor_select
  ON public.vendor_subscription_change_requests FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
CREATE POLICY vendor_subscription_change_requests_vendor_insert
  ON public.vendor_subscription_change_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid
    AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
    AND status='pending'
  );
CREATE POLICY vendor_subscription_change_requests_platform_all
  ON public.vendor_subscription_change_requests FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS vendor_profile_translations_vendor_select ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_select
  ON public.vendor_profile_translations FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
DROP POLICY IF EXISTS vendor_profile_translations_vendor_insert ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_insert
  ON public.vendor_profile_translations FOR INSERT TO bls_app_runtime
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);
DROP POLICY IF EXISTS vendor_profile_translations_vendor_update ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_update
  ON public.vendor_profile_translations FOR UPDATE TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid)
  WITH CHECK (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);

DROP POLICY IF EXISTS tax_documents_vendor_select ON public.tax_documents;
CREATE POLICY tax_documents_vendor_select
  ON public.tax_documents FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);

DROP POLICY IF EXISTS vendor_plans_vendor_market_select ON public.vendor_plans;
CREATE POLICY vendor_plans_vendor_market_select
  ON public.vendor_plans FOR SELECT TO bls_app_runtime
  USING (market_id=nullif(current_setting('app.market_id',true),'')::uuid AND status='active');

DROP POLICY IF EXISTS vendor_subscriptions_vendor_select ON public.vendor_subscriptions;
CREATE POLICY vendor_subscriptions_vendor_select
  ON public.vendor_subscriptions FOR SELECT TO bls_app_runtime
  USING (vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid);

GRANT SELECT,INSERT ON
  public.vendor_promotion_requests,
  public.vendor_aade_action_requests,
  public.vendor_subscription_change_requests
TO bls_app_runtime;

GRANT SELECT,INSERT,UPDATE,DELETE ON
  public.vendor_promotion_requests,
  public.vendor_aade_action_requests,
  public.vendor_subscription_change_requests
TO bls_platform_runtime;

GRANT SELECT,INSERT,UPDATE ON public.vendor_profile_translations TO bls_app_runtime;
GRANT SELECT ON public.tax_documents,public.vendor_plans,public.vendor_subscriptions TO bls_app_runtime;

COMMENT ON TABLE public.vendor_promotion_requests IS
  'SELF_GOVERNED vendor promotion proposals. Platform price governance remains authoritative until approval.';
COMMENT ON TABLE public.vendor_aade_action_requests IS
  'SELF_GOVERNED vendor requests for review, reconciliation or safe retry of vendor-owned AADE documents.';
COMMENT ON TABLE public.vendor_subscription_change_requests IS
  'SELF_GOVERNED vendor plan-change requests. Commercial agreement activation remains platform-governed.';

COMMIT;

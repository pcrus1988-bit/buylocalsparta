-- KONTA MOU - use stable private scope helpers in SELF_GOVERNED HUB RLS policies.
-- This removes raw current_setting() calls from policy expressions while preserving fail-closed tenant scope.

BEGIN;

CREATE OR REPLACE FUNCTION bls_private.current_vendor_scope_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.vendor_id',true),'')::uuid
$$;

CREATE OR REPLACE FUNCTION bls_private.current_market_scope_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.market_id',true),'')::uuid
$$;

REVOKE ALL ON FUNCTION bls_private.current_vendor_scope_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION bls_private.current_market_scope_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bls_private.current_vendor_scope_id() TO bls_app_runtime, bls_platform_runtime;
GRANT EXECUTE ON FUNCTION bls_private.current_market_scope_id() TO bls_app_runtime, bls_platform_runtime;

DROP POLICY IF EXISTS vendor_promotion_requests_vendor_select ON public.vendor_promotion_requests;
CREATE POLICY vendor_promotion_requests_vendor_select
  ON public.vendor_promotion_requests FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

DROP POLICY IF EXISTS vendor_promotion_requests_vendor_insert ON public.vendor_promotion_requests;
CREATE POLICY vendor_promotion_requests_vendor_insert
  ON public.vendor_promotion_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
    AND market_id=(SELECT bls_private.current_market_scope_id())
    AND status='pending'
  );

DROP POLICY IF EXISTS vendor_aade_action_requests_vendor_select ON public.vendor_aade_action_requests;
CREATE POLICY vendor_aade_action_requests_vendor_select
  ON public.vendor_aade_action_requests FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

DROP POLICY IF EXISTS vendor_aade_action_requests_vendor_insert ON public.vendor_aade_action_requests;
CREATE POLICY vendor_aade_action_requests_vendor_insert
  ON public.vendor_aade_action_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
    AND market_id=(SELECT bls_private.current_market_scope_id())
    AND status='pending'
  );

DROP POLICY IF EXISTS vendor_subscription_change_requests_vendor_select ON public.vendor_subscription_change_requests;
CREATE POLICY vendor_subscription_change_requests_vendor_select
  ON public.vendor_subscription_change_requests FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

DROP POLICY IF EXISTS vendor_subscription_change_requests_vendor_insert ON public.vendor_subscription_change_requests;
CREATE POLICY vendor_subscription_change_requests_vendor_insert
  ON public.vendor_subscription_change_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
    AND market_id=(SELECT bls_private.current_market_scope_id())
    AND status='pending'
  );

DROP POLICY IF EXISTS vendor_profile_translations_vendor_select ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_select
  ON public.vendor_profile_translations FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

DROP POLICY IF EXISTS vendor_profile_translations_vendor_insert ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_insert
  ON public.vendor_profile_translations FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

DROP POLICY IF EXISTS vendor_profile_translations_vendor_update ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_update
  ON public.vendor_profile_translations FOR UPDATE TO bls_app_runtime
  USING (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  )
  WITH CHECK (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

DROP POLICY IF EXISTS tax_documents_vendor_select ON public.tax_documents;
CREATE POLICY tax_documents_vendor_select
  ON public.tax_documents FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

DROP POLICY IF EXISTS vendor_plans_vendor_market_select ON public.vendor_plans;
CREATE POLICY vendor_plans_vendor_market_select
  ON public.vendor_plans FOR SELECT TO bls_app_runtime
  USING (
    market_id=(SELECT bls_private.current_market_scope_id())
    AND status='active'
  );

DROP POLICY IF EXISTS vendor_subscriptions_vendor_select ON public.vendor_subscriptions;
CREATE POLICY vendor_subscriptions_vendor_select
  ON public.vendor_subscriptions FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT bls_private.current_vendor_scope_id())
  );

COMMIT;

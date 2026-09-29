-- KONTA MOU - harden SELF_GOVERNED HUB vendor request policies and indexes.
-- This migration addresses the Supabase advisor findings introduced by migration 0291.

BEGIN;

CREATE INDEX vendor_promotion_requests_market_idx
  ON public.vendor_promotion_requests(market_id);
CREATE INDEX vendor_promotion_requests_canonical_idx
  ON public.vendor_promotion_requests(canonical_variant_id);
CREATE INDEX vendor_promotion_requests_requested_by_idx
  ON public.vendor_promotion_requests(requested_by);
CREATE INDEX vendor_promotion_requests_reviewed_by_idx
  ON public.vendor_promotion_requests(reviewed_by);

CREATE INDEX vendor_aade_action_requests_market_idx
  ON public.vendor_aade_action_requests(market_id);
CREATE INDEX vendor_aade_action_requests_requested_by_idx
  ON public.vendor_aade_action_requests(requested_by);
CREATE INDEX vendor_aade_action_requests_reviewed_by_idx
  ON public.vendor_aade_action_requests(reviewed_by);

CREATE INDEX vendor_subscription_change_requests_market_idx
  ON public.vendor_subscription_change_requests(market_id);
CREATE INDEX vendor_subscription_change_requests_current_subscription_idx
  ON public.vendor_subscription_change_requests(current_subscription_id);
CREATE INDEX vendor_subscription_change_requests_requested_plan_idx
  ON public.vendor_subscription_change_requests(requested_plan_id);
CREATE INDEX vendor_subscription_change_requests_requested_by_idx
  ON public.vendor_subscription_change_requests(requested_by);
CREATE INDEX vendor_subscription_change_requests_reviewed_by_idx
  ON public.vendor_subscription_change_requests(reviewed_by);

DROP POLICY IF EXISTS vendor_promotion_requests_vendor_select ON public.vendor_promotion_requests;
CREATE POLICY vendor_promotion_requests_vendor_select
  ON public.vendor_promotion_requests FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

DROP POLICY IF EXISTS vendor_promotion_requests_vendor_insert ON public.vendor_promotion_requests;
CREATE POLICY vendor_promotion_requests_vendor_insert
  ON public.vendor_promotion_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
    AND market_id=(SELECT nullif(current_setting('app.market_id',true),'')::uuid)
    AND status='pending'
  );

DROP POLICY IF EXISTS vendor_promotion_requests_platform_all ON public.vendor_promotion_requests;
CREATE POLICY vendor_promotion_requests_platform_all
  ON public.vendor_promotion_requests FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS vendor_aade_action_requests_vendor_select ON public.vendor_aade_action_requests;
CREATE POLICY vendor_aade_action_requests_vendor_select
  ON public.vendor_aade_action_requests FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

DROP POLICY IF EXISTS vendor_aade_action_requests_vendor_insert ON public.vendor_aade_action_requests;
CREATE POLICY vendor_aade_action_requests_vendor_insert
  ON public.vendor_aade_action_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
    AND market_id=(SELECT nullif(current_setting('app.market_id',true),'')::uuid)
    AND status='pending'
  );

DROP POLICY IF EXISTS vendor_aade_action_requests_platform_all ON public.vendor_aade_action_requests;
CREATE POLICY vendor_aade_action_requests_platform_all
  ON public.vendor_aade_action_requests FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS vendor_subscription_change_requests_vendor_select ON public.vendor_subscription_change_requests;
CREATE POLICY vendor_subscription_change_requests_vendor_select
  ON public.vendor_subscription_change_requests FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

DROP POLICY IF EXISTS vendor_subscription_change_requests_vendor_insert ON public.vendor_subscription_change_requests;
CREATE POLICY vendor_subscription_change_requests_vendor_insert
  ON public.vendor_subscription_change_requests FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
    AND market_id=(SELECT nullif(current_setting('app.market_id',true),'')::uuid)
    AND status='pending'
  );

DROP POLICY IF EXISTS vendor_subscription_change_requests_platform_all ON public.vendor_subscription_change_requests;
CREATE POLICY vendor_subscription_change_requests_platform_all
  ON public.vendor_subscription_change_requests FOR ALL TO bls_platform_runtime
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS vendor_profile_translations_vendor_select ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_select
  ON public.vendor_profile_translations FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

DROP POLICY IF EXISTS vendor_profile_translations_vendor_insert ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_insert
  ON public.vendor_profile_translations FOR INSERT TO bls_app_runtime
  WITH CHECK (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

DROP POLICY IF EXISTS vendor_profile_translations_vendor_update ON public.vendor_profile_translations;
CREATE POLICY vendor_profile_translations_vendor_update
  ON public.vendor_profile_translations FOR UPDATE TO bls_app_runtime
  USING (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  )
  WITH CHECK (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

DROP POLICY IF EXISTS tax_documents_vendor_select ON public.tax_documents;
CREATE POLICY tax_documents_vendor_select
  ON public.tax_documents FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

DROP POLICY IF EXISTS vendor_plans_vendor_market_select ON public.vendor_plans;
CREATE POLICY vendor_plans_vendor_market_select
  ON public.vendor_plans FOR SELECT TO bls_app_runtime
  USING (
    market_id=(SELECT nullif(current_setting('app.market_id',true),'')::uuid)
    AND status='active'
  );

DROP POLICY IF EXISTS vendor_subscriptions_vendor_select ON public.vendor_subscriptions;
CREATE POLICY vendor_subscriptions_vendor_select
  ON public.vendor_subscriptions FOR SELECT TO bls_app_runtime
  USING (
    vendor_id=(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)
  );

COMMIT;

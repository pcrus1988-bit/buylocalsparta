-- KONTA MOY — hosted Supabase RLS hardening for server-only tables.
-- These tables are accessed through the trusted PostgreSQL runtime, not through
-- Supabase anon/authenticated Data API clients. Preserve the existing
-- credential-bound bls_platform_runtime access model while making RLS explicit.

BEGIN;

ALTER TABLE public.checkout_request_guards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_consent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessibility_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessibility_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessibility_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessibility_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessibility_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_activation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.checkout_request_guards;
CREATE POLICY bls_platform_runtime_all ON public.checkout_request_guards
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.privacy_consent_receipts;
CREATE POLICY bls_platform_runtime_all ON public.privacy_consent_receipts
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.accessibility_criteria;
CREATE POLICY bls_platform_runtime_all ON public.accessibility_criteria
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.accessibility_assessments;
CREATE POLICY bls_platform_runtime_all ON public.accessibility_assessments
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.accessibility_reports;
CREATE POLICY bls_platform_runtime_all ON public.accessibility_reports
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.accessibility_findings;
CREATE POLICY bls_platform_runtime_all ON public.accessibility_findings
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.accessibility_audit_runs;
CREATE POLICY bls_platform_runtime_all ON public.accessibility_audit_runs
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

DROP POLICY IF EXISTS bls_platform_runtime_all ON public.vendor_product_activation_requests;
CREATE POLICY bls_platform_runtime_all ON public.vendor_product_activation_requests
  FOR ALL
  USING ((SELECT bls_private.is_platform_runtime()))
  WITH CHECK ((SELECT bls_private.is_platform_runtime()));

REVOKE ALL PRIVILEGES ON TABLE
  public.checkout_request_guards,
  public.privacy_consent_receipts,
  public.accessibility_criteria,
  public.accessibility_assessments,
  public.accessibility_reports,
  public.accessibility_findings,
  public.accessibility_audit_runs,
  public.vendor_product_activation_requests
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.checkout_request_guards,
           public.privacy_consent_receipts,
           public.vendor_product_activation_requests
  TO bls_app_runtime, bls_platform_runtime;

GRANT SELECT
  ON TABLE public.accessibility_criteria
  TO bls_app_runtime, bls_platform_runtime;

GRANT SELECT, UPDATE
  ON TABLE public.accessibility_assessments
  TO bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.accessibility_reports,
           public.accessibility_findings
  TO bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT
  ON TABLE public.accessibility_audit_runs
  TO bls_app_runtime, bls_platform_runtime;

COMMIT;

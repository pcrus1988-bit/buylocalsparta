-- KONTA MOY — make server-private analytics/reporting tables usable by direct internal runtimes under RLS.
-- Vendor/admin scope remains enforced by authenticated application code; Supabase Data API roles stay revoked.

ALTER TABLE public.product_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bls_product_analytics_runtime_all ON public.product_analytics_events;
CREATE POLICY bls_product_analytics_runtime_all ON public.product_analytics_events
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS bls_report_jobs_runtime_all ON public.report_jobs;
CREATE POLICY bls_report_jobs_runtime_all ON public.report_jobs
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS bls_saved_report_definitions_runtime_all ON public.saved_report_definitions;
CREATE POLICY bls_saved_report_definitions_runtime_all ON public.saved_report_definitions
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS bls_report_delivery_events_runtime_all ON public.report_delivery_events;
CREATE POLICY bls_report_delivery_events_runtime_all ON public.report_delivery_events
  FOR ALL
  TO bls_app_runtime, bls_platform_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.product_analytics_events
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
REVOKE ALL ON TABLE public.report_jobs
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
REVOKE ALL ON TABLE public.saved_report_definitions
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
REVOKE ALL ON TABLE public.report_delivery_events
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.product_analytics_events,
  public.report_jobs,
  public.saved_report_definitions,
  public.report_delivery_events
TO bls_app_runtime, bls_platform_runtime;

COMMENT ON TABLE public.product_analytics_events
  IS 'Private server-side product funnel analytics. Direct internal runtimes only; public/Data API roles have no table access.';
COMMENT ON TABLE public.report_jobs
  IS 'Private server-side reporting jobs. Vendor/admin scope is enforced by authenticated application code; public/Data API roles have no table access.';
COMMENT ON TABLE public.saved_report_definitions
  IS 'Private saved report definitions. Direct internal runtimes only; ownership is enforced by authenticated application code.';
COMMENT ON TABLE public.report_delivery_events
  IS 'Private report delivery audit events. Direct internal runtimes only; public/Data API roles have no table access.';

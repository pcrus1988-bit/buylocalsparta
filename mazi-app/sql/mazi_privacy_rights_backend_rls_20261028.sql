-- MAZI GDPR admin register: least-privilege server-side Row Level Security.
-- No access is granted to anon, authenticated, service_role or PUBLIC.
-- Only named backend connection roles that already require server-side Super Admin checks.
-- Access remains limited by table GRANTs (no DELETE on either table).
DROP POLICY IF EXISTS mazi_privacy_requests_backend_select ON public.mazi_privacy_requests;
CREATE POLICY mazi_privacy_requests_backend_select
 ON public.mazi_privacy_requests FOR SELECT
 TO bls_app_runtime, bls_platform_runtime
 USING (true);

DROP POLICY IF EXISTS mazi_privacy_requests_backend_insert ON public.mazi_privacy_requests;
CREATE POLICY mazi_privacy_requests_backend_insert
 ON public.mazi_privacy_requests FOR INSERT
 TO bls_app_runtime, bls_platform_runtime
 WITH CHECK (true);

DROP POLICY IF EXISTS mazi_privacy_requests_backend_update ON public.mazi_privacy_requests;
CREATE POLICY mazi_privacy_requests_backend_update
 ON public.mazi_privacy_requests FOR UPDATE
 TO bls_app_runtime, bls_platform_runtime
 USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS mazi_privacy_request_events_backend_select ON public.mazi_privacy_request_events;
CREATE POLICY mazi_privacy_request_events_backend_select
 ON public.mazi_privacy_request_events FOR SELECT
 TO bls_app_runtime, bls_platform_runtime
 USING (true);

DROP POLICY IF EXISTS mazi_privacy_request_events_backend_insert ON public.mazi_privacy_request_events;
CREATE POLICY mazi_privacy_request_events_backend_insert
 ON public.mazi_privacy_request_events FOR INSERT
 TO bls_app_runtime, bls_platform_runtime
 WITH CHECK (true);

ALTER TABLE public.mazi_privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mazi_privacy_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_privacy_requests,public.mazi_privacy_request_events
 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.mazi_privacy_request_events_id_seq FROM PUBLIC, anon, authenticated;
-- Never add policies for anon/authenticated; users interact solely with authorized server actions.

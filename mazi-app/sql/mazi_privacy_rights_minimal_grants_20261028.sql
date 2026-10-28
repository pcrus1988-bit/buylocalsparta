-- Revoke inherited/default DML permissions not needed by the MAZI GDPR case workflow.
-- Cases: trusted backend may SELECT/INSERT/UPDATE, never DELETE.
-- Evidence: trusted backend may SELECT/INSERT, never UPDATE/DELETE.
REVOKE DELETE ON TABLE public.mazi_privacy_requests
 FROM bls_app_runtime, bls_platform_runtime;
REVOKE UPDATE, DELETE ON TABLE public.mazi_privacy_request_events
 FROM bls_app_runtime, bls_platform_runtime;
REVOKE ALL ON TABLE public.mazi_privacy_requests, public.mazi_privacy_request_events
 FROM PUBLIC, anon, authenticated;
ALTER TABLE public.mazi_privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mazi_privacy_request_events ENABLE ROW LEVEL SECURITY;

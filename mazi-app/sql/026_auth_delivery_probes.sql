-- MAZI 026: private, rate-limited real Supabase Auth email delivery probes.
-- No email addresses, authentication tokens or link contents are stored.
-- A test response is NOT proof of inbox delivery or legal release approval.
CREATE TABLE public.mazi_auth_delivery_probes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_user_id uuid NOT NULL REFERENCES public.users(id),
 interest_id uuid NOT NULL REFERENCES public.mazi_interest_applications(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','provider_accepted','provider_rejected','network_failed')),
 provider_http_status integer,
 provider_error_code text CHECK(provider_error_code IS NULL OR provider_error_code ~ '^[a-z0-9_]{1,64}$'),
 completed_at timestamptz
);
CREATE INDEX mazi_auth_delivery_probes_recent_idx
 ON public.mazi_auth_delivery_probes(requested_at DESC,id DESC);
ALTER TABLE public.mazi_auth_delivery_probes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_auth_delivery_probes FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.mazi_auth_delivery_probes_id_seq FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.mazi_auth_delivery_probes IS
 'Super Admin only: genuine existing-user Auth email response, excluding email addresses and tokens. Provider accepted != delivered. Test does not unlock MAZI invitation gate.';

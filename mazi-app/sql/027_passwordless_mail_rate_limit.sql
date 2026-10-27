-- MAZI: private login-email throttling, with no email address, bearer token, or link stored.
CREATE TABLE IF NOT EXISTS public.mazi_passwordless_email_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 recipient_digest text NOT NULL CHECK(recipient_digest ~ '^[a-f0-9]{64}$'),
 requested_at timestamptz NOT NULL DEFAULT now(),
 outcome text NOT NULL DEFAULT 'requested' CHECK(outcome IN ('requested','sent','failed','skipped'))
);
CREATE INDEX IF NOT EXISTS mazi_passwordless_email_attempts_recent_idx
 ON public.mazi_passwordless_email_attempts (recipient_digest,requested_at DESC);
ALTER TABLE public.mazi_passwordless_email_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mazi_passwordless_email_attempts FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.mazi_passwordless_email_attempts_id_seq FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE public.mazi_passwordless_email_attempts IS 'Marketplace-server-only rate-limit ledger for MAZI magic login emails. Does not store recipient emails or tokens.';

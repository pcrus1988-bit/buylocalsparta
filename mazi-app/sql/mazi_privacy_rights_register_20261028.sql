-- MAZI GDPR rights-case register: administrative metadata only, no personal correspondence.
-- Retention/deletion is intentionally NOT automated. No fictitious consents or completed rights requests.
CREATE TABLE IF NOT EXISTS public.mazi_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref text NOT NULL UNIQUE CHECK (case_ref ~ '^MAZI-DSAR-[A-F0-9]{12}$'),
  request_kind text NOT NULL CHECK (request_kind IN
    ('access','rectification','erasure','restriction','portability','objection','consent_withdrawal','other')),
  received_on date NOT NULL,
  identity_status text NOT NULL DEFAULT 'pending' CHECK (identity_status IN ('pending','verified','cannot_verify')),
  case_status text NOT NULL DEFAULT 'open' CHECK (case_status IN ('open','responded')),
  extension_notified_on date,
  extension_reason text CHECK (extension_reason IS NULL OR extension_reason IN ('complexity','number_of_requests')),
  response_sent_on date,
  response_outcome text CHECK (response_outcome IS NULL OR response_outcome IN ('fulfilled','partially_fulfilled','refused_with_reason','cannot_identify')),
  legal_hold_active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((extension_notified_on IS NULL) = (extension_reason IS NULL)),
  CHECK (extension_notified_on IS NULL OR (extension_notified_on >= received_on AND extension_notified_on <= (received_on + interval '1 month')::date)),
  CHECK ((response_sent_on IS NULL) = (response_outcome IS NULL)),
  CHECK ((case_status = 'responded') = (response_sent_on IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mazi_privacy_requests_open_due_idx
  ON public.mazi_privacy_requests(received_on) WHERE case_status = 'open';

CREATE TABLE IF NOT EXISTS public.mazi_privacy_request_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES public.mazi_privacy_requests(id),
 event_kind text NOT NULL CHECK (event_kind IN
   ('received','identity_verified','identity_unverifiable','extension_notified','response_sent','legal_hold_placed','legal_hold_released','reopened')),
 evidence_ref text NOT NULL CHECK (char_length(evidence_ref) BETWEEN 12 AND 180
   AND evidence_ref ~ '^[A-Za-z0-9_./:#-]+$'),
 actor_user_id uuid NOT NULL REFERENCES public.users(id),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mazi_privacy_request_events_case_idx
 ON public.mazi_privacy_request_events(request_id, recorded_at DESC, id DESC);

CREATE OR REPLACE FUNCTION mazi_private.prevent_privacy_request_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI privacy-rights history is append-only';
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.prevent_privacy_request_event_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS mazi_privacy_request_events_append_only ON public.mazi_privacy_request_events;
CREATE TRIGGER mazi_privacy_request_events_append_only
 BEFORE UPDATE OR DELETE ON public.mazi_privacy_request_events
 FOR EACH ROW EXECUTE FUNCTION mazi_private.prevent_privacy_request_event_mutation();

ALTER TABLE public.mazi_privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mazi_privacy_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_privacy_requests, public.mazi_privacy_request_events
 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.mazi_privacy_request_events_id_seq FROM PUBLIC, anon, authenticated;
-- Same direct-server PG principals as other protected MAZI admin tables.
GRANT SELECT, INSERT, UPDATE ON public.mazi_privacy_requests TO bls_app_runtime, bls_platform_runtime;
GRANT SELECT, INSERT ON public.mazi_privacy_request_events TO bls_app_runtime, bls_platform_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.mazi_privacy_request_events_id_seq TO bls_app_runtime, bls_platform_runtime;
COMMENT ON TABLE public.mazi_privacy_requests IS
 'Admin-only GDPR rights deadline register. Store case references only; no email, names, messages or identification documents.';
COMMENT ON TABLE public.mazi_privacy_request_events IS
 'Append-only human evidence references; no actual GDPR response, identity verification or erasure is automated.';

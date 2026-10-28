-- Restricted MAZI personal-data breach register (GDPR Articles 33-34).
-- Metadata and opaque references only. No PII, raw logs, email addresses, or leaked secrets.
-- No notification to authorities/subjects is sent by this schema.
CREATE TABLE IF NOT EXISTS public.mazi_breach_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_ref text NOT NULL UNIQUE CHECK (case_ref ~ '^MAZI-BREACH-[A-F0-9]{12}$'),
 aware_at timestamptz NOT NULL,
 source_reference text NOT NULL CHECK (char_length(source_reference) BETWEEN 12 AND 180
   AND source_reference ~ '^[A-Za-z0-9_./:#-]+$'),
 risk_assessment text NOT NULL DEFAULT 'pending' CHECK (risk_assessment IN
   ('pending','not_personal_data','unlikely_risk','risk','high_risk')),
 case_status text NOT NULL DEFAULT 'open' CHECK (case_status IN ('open','closed')),
 authority_notified_at timestamptz,
 subjects_notified_at timestamptz,
 subjects_exception text CHECK (subjects_exception IS NULL OR subjects_exception IN
   ('effective_protection','subsequent_measures','disproportionate_effort')),
 created_by uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (case_status <> 'closed' OR (
  risk_assessment <> 'pending'
  AND (risk_assessment NOT IN ('risk','high_risk') OR authority_notified_at IS NOT NULL)
  AND (risk_assessment <> 'high_risk' OR subjects_notified_at IS NOT NULL OR subjects_exception IS NOT NULL)
 ))
);
CREATE INDEX IF NOT EXISTS mazi_breach_cases_open_idx
 ON public.mazi_breach_cases(aware_at ASC) WHERE case_status='open';
CREATE TABLE IF NOT EXISTS public.mazi_breach_case_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id uuid NOT NULL REFERENCES public.mazi_breach_cases(id),
 event_kind text NOT NULL CHECK (event_kind IN
   ('recorded','assessed','authority_notified','subjects_notified','subjects_exception','closed','reopened')),
 evidence_ref text NOT NULL CHECK (char_length(evidence_ref) BETWEEN 12 AND 180
   AND evidence_ref ~ '^[A-Za-z0-9_./:#-]+$'),
 effective_at timestamptz,
 risk_assessment text CHECK (risk_assessment IS NULL OR risk_assessment IN
   ('not_personal_data','unlikely_risk','risk','high_risk')),
 subjects_exception text CHECK (subjects_exception IS NULL OR subjects_exception IN
   ('effective_protection','subsequent_measures','disproportionate_effort')),
 late_reason_ref text CHECK (late_reason_ref IS NULL OR
   (char_length(late_reason_ref) BETWEEN 12 AND 180
    AND late_reason_ref ~ '^[A-Za-z0-9_./:#-]+$')),
 actor_user_id uuid NOT NULL REFERENCES public.users(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((event_kind IN ('recorded','authority_notified','subjects_notified')) = (effective_at IS NOT NULL)),
 CHECK ((event_kind='assessed') = (risk_assessment IS NOT NULL)),
 CHECK ((event_kind='subjects_exception') = (subjects_exception IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS mazi_breach_events_case_idx
 ON public.mazi_breach_case_events(case_id, recorded_at DESC, id DESC);

CREATE OR REPLACE FUNCTION mazi_private.prevent_breach_case_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'MAZI breach evidence is append-only';
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.prevent_breach_case_event_mutation() FROM PUBLIC;
DROP TRIGGER IF EXISTS mazi_breach_event_immutable ON public.mazi_breach_case_events;
CREATE TRIGGER mazi_breach_event_immutable BEFORE UPDATE OR DELETE
 ON public.mazi_breach_case_events FOR EACH ROW
 EXECUTE FUNCTION mazi_private.prevent_breach_case_event_mutation();

CREATE OR REPLACE FUNCTION mazi_private.prevent_breach_intake_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.case_ref,NEW.aware_at,NEW.source_reference,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.case_ref,OLD.aware_at,OLD.source_reference,OLD.created_by,OLD.created_at) THEN
  RAISE EXCEPTION 'Original awareness and breach intake evidence are immutable';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.prevent_breach_intake_rewrite() FROM PUBLIC;
DROP TRIGGER IF EXISTS mazi_breach_intake_immutable ON public.mazi_breach_cases;
CREATE TRIGGER mazi_breach_intake_immutable BEFORE UPDATE
 ON public.mazi_breach_cases FOR EACH ROW
 EXECUTE FUNCTION mazi_private.prevent_breach_intake_rewrite();

ALTER TABLE public.mazi_breach_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mazi_breach_case_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mazi_breach_cases,public.mazi_breach_case_events
 FROM PUBLIC,anon,authenticated,service_role,bls_app_runtime,bls_platform_runtime;
REVOKE ALL ON SEQUENCE public.mazi_breach_case_events_id_seq
 FROM PUBLIC,anon,authenticated,service_role,bls_app_runtime,bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE ON public.mazi_breach_cases
 TO bls_app_runtime,bls_platform_runtime;
GRANT SELECT,INSERT ON public.mazi_breach_case_events
 TO bls_app_runtime,bls_platform_runtime;
GRANT USAGE,SELECT ON SEQUENCE public.mazi_breach_case_events_id_seq
 TO bls_app_runtime,bls_platform_runtime;

DROP POLICY IF EXISTS mazi_breach_cases_server_select ON public.mazi_breach_cases;
CREATE POLICY mazi_breach_cases_server_select ON public.mazi_breach_cases FOR SELECT
 TO bls_app_runtime,bls_platform_runtime USING (true);
DROP POLICY IF EXISTS mazi_breach_cases_server_insert ON public.mazi_breach_cases;
CREATE POLICY mazi_breach_cases_server_insert ON public.mazi_breach_cases FOR INSERT
 TO bls_app_runtime,bls_platform_runtime WITH CHECK (true);
DROP POLICY IF EXISTS mazi_breach_cases_server_update ON public.mazi_breach_cases;
CREATE POLICY mazi_breach_cases_server_update ON public.mazi_breach_cases FOR UPDATE
 TO bls_app_runtime,bls_platform_runtime USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS mazi_breach_events_server_select ON public.mazi_breach_case_events;
CREATE POLICY mazi_breach_events_server_select ON public.mazi_breach_case_events FOR SELECT
 TO bls_app_runtime,bls_platform_runtime USING (true);
DROP POLICY IF EXISTS mazi_breach_events_server_insert ON public.mazi_breach_case_events;
CREATE POLICY mazi_breach_events_server_insert ON public.mazi_breach_case_events FOR INSERT
 TO bls_app_runtime,bls_platform_runtime WITH CHECK (true);

COMMENT ON TABLE public.mazi_breach_cases IS
 'Administrative GDPR Art.33-34 awareness and decision register. No email, secrets or raw incident content; no external notifications are automated.';
COMMENT ON TABLE public.mazi_breach_case_events IS
 'Append-only real-world incident evidence and actual notification records; never a substitute for real external submission or counsel review.';

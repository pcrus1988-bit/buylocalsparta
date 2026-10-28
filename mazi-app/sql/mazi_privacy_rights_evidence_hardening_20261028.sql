-- Preserve historic GDPR rights event dates and decisions when a case is reopened.
ALTER TABLE public.mazi_privacy_request_events
 ADD COLUMN IF NOT EXISTS effective_on date,
 ADD COLUMN IF NOT EXISTS documented_reason text,
 ADD COLUMN IF NOT EXISTS response_outcome text;
ALTER TABLE public.mazi_privacy_request_events
 ADD CONSTRAINT mazi_privacy_event_effective_date_guard
 CHECK (event_kind NOT IN ('received','extension_notified','response_sent') OR effective_on IS NOT NULL);
ALTER TABLE public.mazi_privacy_request_events
 ADD CONSTRAINT mazi_privacy_event_extension_reason_guard
 CHECK (event_kind <> 'extension_notified' OR documented_reason IN ('complexity','number_of_requests'));
ALTER TABLE public.mazi_privacy_request_events
 ADD CONSTRAINT mazi_privacy_event_response_guard
 CHECK (event_kind <> 'response_sent' OR response_outcome IN
   ('fulfilled','partially_fulfilled','refused_with_reason','cannot_identify'));

CREATE OR REPLACE FUNCTION mazi_private.protect_privacy_request_intake()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.case_ref,NEW.request_kind,NEW.received_on,NEW.created_by,NEW.created_at)
   IS DISTINCT FROM
    (OLD.id,OLD.case_ref,OLD.request_kind,OLD.received_on,OLD.created_by,OLD.created_at)
 THEN
  RAISE EXCEPTION 'MAZI GDPR receipt metadata is immutable; retain original intake evidence';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mazi_private.protect_privacy_request_intake() FROM PUBLIC;
DROP TRIGGER IF EXISTS mazi_privacy_request_intake_immutable ON public.mazi_privacy_requests;
CREATE TRIGGER mazi_privacy_request_intake_immutable
 BEFORE UPDATE ON public.mazi_privacy_requests
 FOR EACH ROW EXECUTE FUNCTION mazi_private.protect_privacy_request_intake();

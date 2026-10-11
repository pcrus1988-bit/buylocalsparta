-- FISCAL 0020: authenticated Resend notification events, append-only and isolated.
-- A provider API acceptance is not evidence of delivery.
BEGIN;

CREATE TABLE public.fiscal_security_alert_delivery_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 outbox_id uuid NOT NULL REFERENCES public.fiscal_security_alert_outbox(id) ON DELETE RESTRICT,
 provider_event_id text NOT NULL UNIQUE CHECK(length(provider_event_id) BETWEEN 3 AND 160),
 event_type text NOT NULL CHECK(event_type IN
  ('email.delivered','email.delivery_delayed','email.bounced',
   'email.complained','email.failed','email.suppressed')),
 provider_event_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 CHECK(provider_event_at<=received_at+interval '10 minutes'
       AND provider_event_at>received_at-interval '14 days')
);
CREATE INDEX fiscal_security_alert_delivery_by_outbox_idx
 ON public.fiscal_security_alert_delivery_events(outbox_id,received_at DESC,id DESC);
CREATE FUNCTION public.fiscal_security_alert_delivery_append_only() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'Verified provider delivery receipts cannot be changed or deleted';
END $$;
CREATE TRIGGER fiscal_security_alert_delivery_append_only_trigger
 BEFORE UPDATE OR DELETE ON public.fiscal_security_alert_delivery_events
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_security_alert_delivery_append_only();

ALTER TABLE public.fiscal_security_alert_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_security_alert_delivery_events FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_security_alert_delivery_append_only() FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.fiscal_security_alert_delivery_events FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.fiscal_security_alert_delivery_append_only() FROM %I',r);
 END LOOP;
END $$;
COMMIT;

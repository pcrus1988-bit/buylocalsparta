-- Canonical migration 0449: SES feedback events for Press Office reports.
-- This ledger is distinct from SES API acceptance and never invents 'delivered'.
BEGIN;

CREATE TABLE public.research_press_delivery_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  release_id uuid NOT NULL,
  recipient text NOT NULL,
  ses_message_id text NOT NULL CHECK (length(ses_message_id) BETWEEN 1 AND 256),
  sns_message_id text NOT NULL CHECK (length(sns_message_id) BETWEEN 1 AND 256),
  event_type text NOT NULL CHECK (event_type IN ('delivered','bounced','complained','rejected','delivery_delayed','opened','clicked')),
  event_at timestamptz NOT NULL,
  detail text CHECK (detail IS NULL OR length(detail) <= 500),
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_press_delivery_events_parent_fk FOREIGN KEY (release_id,recipient)
    REFERENCES public.research_press_deliveries(release_id,recipient) ON DELETE RESTRICT,
  CONSTRAINT research_press_delivery_events_unique UNIQUE (sns_message_id,recipient,event_type)
);
CREATE INDEX research_press_delivery_events_release_recipient_idx
  ON public.research_press_delivery_events(release_id,recipient,event_at DESC);
CREATE INDEX research_press_delivery_events_ses_idx
  ON public.research_press_delivery_events(ses_message_id,recipient);
ALTER TABLE public.research_press_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_press_delivery_events_runtime ON public.research_press_delivery_events
  FOR ALL TO bls_app_runtime,bls_platform_runtime USING (true) WITH CHECK (true);
REVOKE ALL ON public.research_press_delivery_events
  FROM PUBLIC, anon, authenticated, service_role, bls_app_runtime, bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.research_press_delivery_events
  TO bls_app_runtime,bls_platform_runtime;
COMMENT ON TABLE public.research_press_delivery_events IS
  'Verified SNS provider outcomes for press recipients; successful SES submission is not evidence of delivery.';
COMMIT;

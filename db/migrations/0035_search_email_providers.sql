-- Production search/email provider bridge state.
-- Search remains an external projection; email webhooks are privacy-minimised and idempotent.

BEGIN;

CREATE TABLE notification_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  provider_message_id text,
  event_created_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,event_id)
);
CREATE INDEX notification_provider_events_message_idx ON notification_provider_events(provider,provider_message_id,event_created_at DESC);

CREATE TABLE notification_destination_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('email','sms','push')),
  destination_hash text NOT NULL,
  provider text NOT NULL,
  reason text NOT NULL,
  source_event_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel,destination_hash)
);
CREATE INDEX notification_destination_suppressions_active_idx ON notification_destination_suppressions(channel,active,updated_at DESC);

ALTER TABLE notification_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_destination_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_provider_events_platform_only ON notification_provider_events
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');
CREATE POLICY notification_destination_suppressions_platform_only ON notification_destination_suppressions
  USING (current_setting('app.platform_access', true)='true')
  WITH CHECK (current_setting('app.platform_access', true)='true');

COMMIT;

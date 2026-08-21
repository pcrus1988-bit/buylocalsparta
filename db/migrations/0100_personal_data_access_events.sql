BEGIN;

ALTER TABLE security_events
  DROP CONSTRAINT IF EXISTS security_events_event_type_check;

ALTER TABLE security_events
  ADD CONSTRAINT security_events_event_type_check CHECK (event_type IN (
    'rate_limit.exceeded',
    'auth.login_failed',
    'csrf.rejected',
    'access.denied',
    'request.rejected',
    'personal_data.accessed',
    'personal_data.revealed',
    'personal_data.exported'
  ));

COMMENT ON COLUMN security_events.event_type IS
  'Bounded security/access event taxonomy. Personal-data access events must contain only hashed subjects and sanitized metadata.';

COMMIT;

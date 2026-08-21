BEGIN;

-- Privacy by default for future customer profiles.
-- Existing rows are deliberately not rewritten: legacy profiles may contain
-- implicit TRUE values created before explicit preference provenance existed.
ALTER TABLE customer_profiles
  ALTER COLUMN recommendations_enabled SET DEFAULT false;

ALTER TABLE customer_profiles
  ALTER COLUMN recently_viewed_enabled SET DEFAULT false;

COMMENT ON COLUMN customer_profiles.recommendations_enabled IS
  'Optional recommendation personalization. Defaults off for new profiles; enable only through an explicit customer preference action.';

COMMENT ON COLUMN customer_profiles.recently_viewed_enabled IS
  'Optional recently-viewed tracking. Defaults off for new profiles; enable only through an explicit customer preference action.';

-- Keep the operational privacy-request vocabulary aligned with GDPR rights
-- exposed in the authenticated Privacy & Data Centre. Existing request types
-- remain valid; this only adds restriction of processing.
ALTER TABLE privacy_requests
  DROP CONSTRAINT IF EXISTS privacy_requests_request_type_check;

ALTER TABLE privacy_requests
  ADD CONSTRAINT privacy_requests_request_type_check CHECK (
    request_type = ANY (ARRAY[
      'access'::text,
      'export'::text,
      'correction'::text,
      'deletion'::text,
      'restriction'::text,
      'objection'::text,
      'marketing_withdrawal'::text,
      'account_closure'::text
    ])
  );

COMMIT;

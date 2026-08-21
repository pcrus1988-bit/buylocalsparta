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

COMMIT;

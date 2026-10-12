-- Administrative review of municipality-name correspondence, not verification of a
-- physical business location, ownership, operating status, or publication rights.
ALTER TABLE research_private.hub_gemi_municipality_matches
  DROP CONSTRAINT IF EXISTS hub_gemi_municipality_matches_match_method_check;
ALTER TABLE research_private.hub_gemi_municipality_matches
  ADD CONSTRAINT hub_gemi_municipality_matches_match_method_check
  CHECK (match_method IN ('unique_exact_transliteration','normalized_genitive_variant','reviewed_manual'));

CREATE TABLE IF NOT EXISTS research_private.hub_gemi_municipality_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_municipality_id text NOT NULL REFERENCES research_private.hub_gemi_municipality_matches(registry_municipality_id),
  gazetteer_source_id text NOT NULL,
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 3 AND 100),
  previous_status text NOT NULL CHECK (previous_status='proposed'),
  decision text NOT NULL CHECK (decision IN ('reviewed','rejected')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 20 AND 600),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE research_private.hub_gemi_municipality_review_events IS
  'Append-only human administrative-name review. Does not authorize GEMI listing or imply real-world business geo verification.';
CREATE INDEX IF NOT EXISTS hub_gemi_municipality_review_events_recent_idx
  ON research_private.hub_gemi_municipality_review_events(created_at DESC,registry_municipality_id);

ALTER TABLE research_private.hub_gemi_municipality_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON research_private.hub_gemi_municipality_review_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON research_private.hub_gemi_municipality_review_events TO bls_app_runtime,bls_platform_runtime;
GRANT UPDATE(review_status,checked_at) ON research_private.hub_gemi_municipality_matches TO bls_app_runtime;

DROP POLICY IF EXISTS hub_gemi_municipality_matches_admin_review ON research_private.hub_gemi_municipality_matches;
CREATE POLICY hub_gemi_municipality_matches_admin_review ON research_private.hub_gemi_municipality_matches
  FOR UPDATE TO bls_app_runtime USING (review_status='proposed')
  WITH CHECK (review_status IN ('reviewed','rejected'));

DROP POLICY IF EXISTS hub_gemi_municipality_review_events_app_read ON research_private.hub_gemi_municipality_review_events;
CREATE POLICY hub_gemi_municipality_review_events_app_read ON research_private.hub_gemi_municipality_review_events
  FOR SELECT TO bls_app_runtime USING (true);
DROP POLICY IF EXISTS hub_gemi_municipality_review_events_app_insert ON research_private.hub_gemi_municipality_review_events;
CREATE POLICY hub_gemi_municipality_review_events_app_insert ON research_private.hub_gemi_municipality_review_events
  FOR INSERT TO bls_app_runtime WITH CHECK (true);
DROP POLICY IF EXISTS hub_gemi_municipality_review_events_platform_read ON research_private.hub_gemi_municipality_review_events;
CREATE POLICY hub_gemi_municipality_review_events_platform_read ON research_private.hub_gemi_municipality_review_events
  FOR SELECT TO bls_platform_runtime USING (true);
DROP POLICY IF EXISTS hub_gemi_municipality_review_events_platform_insert ON research_private.hub_gemi_municipality_review_events;
CREATE POLICY hub_gemi_municipality_review_events_platform_insert ON research_private.hub_gemi_municipality_review_events
  FOR INSERT TO bls_platform_runtime WITH CHECK (true);

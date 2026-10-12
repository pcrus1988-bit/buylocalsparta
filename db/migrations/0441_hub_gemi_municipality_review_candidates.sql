-- Review-only admin geography proposals, sourced from CC-BY-4.0 municipal centres.
-- Registry municipality centroids never establish that a company is inside a 25km HUB.
ALTER TABLE research_private.hub_gemi_directory
  ADD COLUMN IF NOT EXISTS registry_municipality_id text;
CREATE INDEX IF NOT EXISTS hub_gemi_directory_municipality_id_idx
  ON research_private.hub_gemi_directory(registry_municipality_id);

CREATE TABLE IF NOT EXISTS research_private.hub_gemi_municipality_centroids (
 source_id text PRIMARY KEY CHECK(source_id ~ '^GR[0-9]{4}M[0-9]{3}$'),
 municipality_name text NOT NULL,
 source_region text,
 latitude double precision NOT NULL CHECK(latitude BETWEEN 34 AND 43),
 longitude double precision NOT NULL CHECK(longitude BETWEEN 19 AND 30),
 source_uri text NOT NULL DEFAULT 'https://github.com/open-admin-data/greece-administrative-divisions',
 attribution text NOT NULL DEFAULT 'Greece Administrative Divisions Dataset, CC-BY-4.0',
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research_private.hub_gemi_municipality_matches (
 registry_municipality_id text PRIMARY KEY,
 registry_municipality_name text NOT NULL,
 gazetteer_source_id text NOT NULL REFERENCES research_private.hub_gemi_municipality_centroids(source_id),
 match_method text NOT NULL CHECK(match_method IN ('unique_exact_transliteration','reviewed_manual')),
 candidate_hub_id text CHECK(candidate_hub_id IS NULL OR candidate_hub_id ~ '^KM-HUB-[0-9]{3}$'),
 candidate_hub_slug text,
 candidate_hub_distance_km numeric CHECK(candidate_hub_distance_km IS NULL OR candidate_hub_distance_km >= 0),
 matching_business_count integer NOT NULL DEFAULT 0 CHECK(matching_business_count >= 0),
 review_status text NOT NULL DEFAULT 'proposed' CHECK(review_status IN ('proposed','reviewed','rejected')),
 source_precision text NOT NULL DEFAULT 'municipality_centroid' CHECK(source_precision='municipality_centroid'),
 checked_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE research_private.hub_gemi_municipality_matches IS
 'Private approximate municipal centroids for proposing HUB candidates, NEVER verified 25km assignment or public business pages.';
CREATE INDEX IF NOT EXISTS hub_gemi_municipality_match_candidate_idx
 ON research_private.hub_gemi_municipality_matches(candidate_hub_id,review_status);
ALTER TABLE research_private.hub_gemi_municipality_centroids ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_private.hub_gemi_municipality_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON research_private.hub_gemi_municipality_centroids FROM PUBLIC,anon,authenticated;
REVOKE ALL ON research_private.hub_gemi_municipality_matches FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON research_private.hub_gemi_municipality_centroids TO bls_platform_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON research_private.hub_gemi_municipality_matches TO bls_platform_runtime;
DROP POLICY IF EXISTS hub_gemi_municipality_centroids_platform ON research_private.hub_gemi_municipality_centroids;
CREATE POLICY hub_gemi_municipality_centroids_platform ON research_private.hub_gemi_municipality_centroids
 FOR ALL TO bls_platform_runtime USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS hub_gemi_municipality_matches_platform ON research_private.hub_gemi_municipality_matches;
CREATE POLICY hub_gemi_municipality_matches_platform ON research_private.hub_gemi_municipality_matches
 FOR ALL TO bls_platform_runtime USING(true) WITH CHECK(true);

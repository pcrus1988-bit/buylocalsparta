-- Application runtime can read only non-personal municipality-review aggregates,
-- never private census rows or the survey/research contact vault.
GRANT SELECT ON research_private.hub_gemi_municipality_matches TO bls_app_runtime;
GRANT SELECT ON research_private.hub_gemi_municipality_centroids TO bls_app_runtime;
GRANT SELECT ON research_private.hub_gemi_hub_master TO bls_app_runtime;
DROP POLICY IF EXISTS hub_gemi_municipality_matches_admin_snapshot ON research_private.hub_gemi_municipality_matches;
CREATE POLICY hub_gemi_municipality_matches_admin_snapshot ON research_private.hub_gemi_municipality_matches
 FOR SELECT TO bls_app_runtime USING (true);
DROP POLICY IF EXISTS hub_gemi_municipality_centroids_admin_snapshot ON research_private.hub_gemi_municipality_centroids;
CREATE POLICY hub_gemi_municipality_centroids_admin_snapshot ON research_private.hub_gemi_municipality_centroids
 FOR SELECT TO bls_app_runtime USING (true);
DROP POLICY IF EXISTS hub_gemi_master_admin_snapshot ON research_private.hub_gemi_hub_master;
CREATE POLICY hub_gemi_master_admin_snapshot ON research_private.hub_gemi_hub_master
 FOR SELECT TO bls_app_runtime USING (true);

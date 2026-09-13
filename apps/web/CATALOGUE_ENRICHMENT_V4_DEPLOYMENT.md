# Catalogue enrichment V4 deployment

Catalogue enrichment V4 requires database migration `0242_catalogue_enrichment_v4_research.sql` to be present in production before the web application is deployed.

The production migration was applied before this deployment-triggering commit. The build-time production schema guard is expected to verify schema version 242 before allowing the deployment to proceed.

This file intentionally lives inside `apps/web` so Vercel's monorepo affected-project detection performs a real production rebuild after the schema migration rather than skipping an otherwise tree-equivalent redeploy.

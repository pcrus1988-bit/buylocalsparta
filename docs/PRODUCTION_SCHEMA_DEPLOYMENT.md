# Production schema deployment

KONTA MOU production uses an immutable application migration ledger and a fail-closed Vercel schema gate. A production web build that expects a schema version newer than the live database **must not** be promoted until the matching repository migration has been applied and verified.

## Required order

1. Merge only a migration whose checksum manifest is green in CI.
2. Identify the repository schema head (`EXPECTED_SCHEMA_VERSION`) and the corresponding `db/migrations/NNNN_*.sql` file.
3. Apply that exact immutable migration to the production PostgreSQL/Supabase project before retrying the production application deployment.
4. Verify `public.schema_migrations` contains the exact version, filename and SHA-256 from the repository checksum manifest.
5. Verify any new tables, indexes, constraints, RLS policies and grants required by the migration are present.
6. Run database/security readiness checks appropriate to the migration.
7. Deploy/redeploy the exact `main` commit.
8. Require the Vercel production schema gate, Production CI and browser acceptance to pass before considering the release healthy.
9. Verify the resulting production deployment is `READY` and that the production alias still resolves to the expected deployment.

## Never do

- Do not edit an already-applied migration or checksum.
- Do not create two different migrations with the same numeric version.
- Do not advance `EXPECTED_SCHEMA_VERSION` without the matching repository migration and checksum.
- Do not bypass or weaken the production schema gate to make a deployment green.
- Do not treat a green Preview deployment as proof that the production database is at the required schema version.
- Do not insert a migration-ledger row without applying and verifying the matching DDL atomically.

## Recovery when the schema gate blocks production

If Vercel reports that production is behind the repository migration ledger:

1. Leave the last known-good production deployment serving traffic.
2. Read the failed build log and identify the exact expected and actual schema versions.
3. Confirm the production database state independently before making changes.
4. Apply only the pending immutable repository migration(s), in order, under the migration advisory lock.
5. Verify the application migration ledger and affected database objects.
6. Redeploy the same application tree; do not change application logic merely to retrigger the build.

## 2026-08-23 incident note

After `0128_catalog_web_crawl_ingestion.sql` merged, the first production build correctly failed closed because production was still at schema 127. Migration 0128 was then applied with repository SHA-256 `adc79db8c3de7e577545392a671b76cda9b47295fe60baa18922102080bb4d7d`, the four crawl-ingestion tables and their RLS state were verified, and production was redeployed. This is the intended behavior of the schema gate: application code must never silently outrun the production database.

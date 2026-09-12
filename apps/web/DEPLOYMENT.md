# Web production deployment order

The production web build verifies the live KONTA MOY migration ledger before it is allowed to deploy.

For a release that advances `EXPECTED_SCHEMA_VERSION`:

1. Merge only after CI and preview validation are green.
2. Apply the matching production database migration.
3. Reconcile `public.schema_migrations` with the repository filename and SHA-256 digest.
4. Deploy or redeploy the same application commit.
5. Verify the production deployment is READY and database readiness reports the same schema version.

This ordering is intentional. A build that starts before the production migration is installed must fail closed with a schema-drift error rather than serving application code against an unexpected database schema.
